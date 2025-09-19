#!/usr/bin/env python3
"""Synthesize a story from a text file using the existing pipeline_supervoice module.

Usage examples:
  python run_story_from_file.py --story-file ./my_story.txt --checkpoint /path/to/checkpoint.pth --out /tmp/my_story.wav --device cpu
  python run_story_from_file.py --text "Коротка історія..." --checkpoint /path/to/checkpoint.pth --out /tmp/my_story.wav

This script mirrors the flow in `run_story_tts.py` but takes the story from an external file
or inline `--text` so you don't need to edit python files to swap stories.
"""
import argparse
import os
import importlib.util
import sys


def load_pipeline_module():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    pipeline_path = os.path.join(repo_root, 'ukrainian-tts', 'vocoder', 'pipeline_supervoice.py')
    spec = importlib.util.spec_from_file_location('pipeline_supervoice', pipeline_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def read_story_from_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--device', default='cpu')
    p.add_argument('--checkpoint', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--story-file', help='Path to a UTF-8 text file containing the story')
    p.add_argument('--text', help='Inline story text (useful for short stories)')
    p.add_argument('--tmpdir')
    args = p.parse_args()

    if not args.story_file and not args.text:
        p.error('Either --story-file or --text must be provided')

    if args.story_file:
        if not os.path.exists(args.story_file):
            print('Story file not found:', args.story_file, file=sys.stderr)
            sys.exit(2)
        story = read_story_from_file(args.story_file)
    else:
        story = args.text

    mod = load_pipeline_module()

    # prepare tmpdir
    tmpdir = args.tmpdir or os.path.join('/tmp', 'atlas_story')
    os.makedirs(tmpdir, exist_ok=True)

    # find TTS class
    TTSClass = mod.find_tts_package()
    if TTSClass is None:
        raise RuntimeError('Could not find ukrainian_tts package in repository (ukrainian-tts-mps or ukrainian-tts).')

    source_wav = os.path.join(tmpdir, 'tts_out.wav')
    print('Synthesizing TTS to', source_wav)
    # Reuse the same synth helper as the other runner
    mod.synthesize_text_to_wav(TTSClass, story, 'dmytro', 'dictionary', args.device, source_wav)

    print('Extracting mel and running vocoder...')
    mel, sr = mod.wav_to_mel(source_wav)
    mel_path = os.path.join(tmpdir, 'mel.npy')
    import numpy as np
    np.save(mel_path, mel)
    voc_out = os.path.join(tmpdir, 'vocoder_out.wav')
    mod.run_vocoder_infer(mel_path, args.checkpoint, voc_out, sr=sr)

    # Postprocess and write final mastered WAV (PCM_24, 44.1k)
    import soundfile as sf
    from scipy.signal import resample_poly
    y, sr_in = sf.read(voc_out, dtype='float32')
    if y.ndim > 1:
        y = y.mean(axis=1)
    target_sr = 44100
    if sr_in != target_sr:
        from math import gcd
        up = target_sr
        down = sr_in
        g = gcd(up, down)
        up //= g
        down //= g
        y = resample_poly(y, up, down)

    # normalize (match prior pipeline behavior)
    import numpy as _np
    peak = max(1e-9, float(_np.max(_np.abs(y))))
    target = 10 ** (-0.5 / 20.0)
    y = (y / peak) * target
    sf.write(args.out, y, target_sr, subtype='PCM_24')
    print('Wrote final mastered WAV to', args.out)


if __name__ == '__main__':
    main()
