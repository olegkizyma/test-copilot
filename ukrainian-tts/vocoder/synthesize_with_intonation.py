#!/usr/bin/env python3
"""Synthesize STORY with tempo and simple intonation overrides.

Usage examples (from repo root):
  python ukrainian-tts/vocoder/synthesize_with_intonation.py --speed 0.55 --out /tmp/atlas_story_uk_master_very_slow2.wav
  python ukrainian-tts/vocoder/synthesize_with_intonation.py --speed 0.55 --extra-pauses --overrides ukrainian-tts/vocoder/intonation_overrides.json --out /tmp/atlas_story_uk_master_very_slow2_pauses.wav

The script:
- extracts STORY from `run_story_tts.py`
- applies optional word->replacement overrides (JSON)
- if --extra-pauses is set it inserts sentence breaks (splits on commas) to increase pauses
- synthesizes with Coqui TTS `tts_models/uk/mai/vits` with the requested speed
- rescales to 44.1kHz and writes PCM_24

This is a pragmatic helper for iterative manual correction of intonation. For precise control we can accept phonetic (IPA) overrides in the JSON file.
"""
import argparse
import json
import os
import re
from math import gcd

try:
    from TTS.api import TTS
except Exception as e:
    raise RuntimeError('TTS package not available in current Python environment') from e

import soundfile as sf
from scipy.signal import resample_poly


def extract_story(script_path):
    with open(script_path, 'r', encoding='utf-8') as f:
        s = f.read()
    start = s.find('STORY = """')
    if start != -1:
        start += len('STORY = """')
        end = s.find('"""', start)
        if end != -1:
            return s[start:end].strip()
    return s


def apply_overrides(text, overrides):
    # replace whole-word matches using regex word boundaries
    for word, repl in overrides.items():
        # escape regex metachars in word
        pattern = r"\b" + re.escape(word) + r"\b"
        # use a callable replacement to avoid treating backslashes in repl as
        # regex backreferences (which can raise 'bad escape' errors)
        def _repl(m, _repl=repl):
            return _repl
        text = re.sub(pattern, _repl, text)
    return text


def insert_extra_pauses(text):
    # Heuristic: split on commas and join with '. ' to force sentence breaks
    # Keeps existing sentence endings intact.
    parts = re.split(r'(?<=[,;:])\s*', text)
    out = '. '.join([p.strip() for p in parts if p.strip()])
    return out


def synthesize_and_master(text, out_path, speed=0.7, tmp_raw='/tmp/tts_raw.wav'):
    model = TTS('tts_models/uk/mai/vits')
    # synthesize to temporary raw file (model sample_rate is typically 22050)
    model.tts_to_file(text=text, file_path=tmp_raw, speed=speed, split_sentences=True)

    # postprocess: resample to 44100 and normalize to -0.5 dBFS
    y, sr = sf.read(tmp_raw, dtype='float32')
    if y.ndim > 1:
        y = y.mean(axis=1)
    if sr != 44100:
        up = 44100
        down = sr
        g = gcd(up, down)
        up //= g
        down //= g
        y = resample_poly(y, up, down)
    peak = max(1e-9, float(abs(y).max()))
    target = 10 ** (-0.5 / 20.0)
    y = (y / peak) * target
    sf.write(out_path, y, 44100, subtype='PCM_24')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--speed', type=float, default=0.7)
    p.add_argument('--extra-pauses', action='store_true')
    p.add_argument('--overrides', type=str, default=None, help='JSON file with word->replacement map')
    p.add_argument('--out', type=str, required=True, help='Output WAV path (PCM_24, 44.1k)')
    p.add_argument('--tmp', type=str, default='/tmp/tts_raw.wav')
    args = p.parse_args()

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    script_path = os.path.join(repo_root, 'ukrainian-tts', 'vocoder', 'run_story_tts.py')
    story = extract_story(script_path)

    if args.overrides and os.path.exists(args.overrides):
        with open(args.overrides, 'r', encoding='utf-8') as fh:
            overrides = json.load(fh)
        story = apply_overrides(story, overrides)

    if args.extra_pauses:
        story = insert_extra_pauses(story)

    print('Final story length (chars):', len(story))
    synthesize_and_master(story, args.out, speed=args.speed, tmp_raw=args.tmp)
    print('Wrote', args.out)


if __name__ == '__main__':
    main()
