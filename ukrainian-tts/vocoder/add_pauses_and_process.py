#!/usr/bin/env python3
"""Insert longer pauses at commas and sentence ends and run SoX-based processing.

Usage:
  python add_pauses_and_process.py \
    --in /tmp/atlas_story_uk_master_very_slow_cleaned_pitch_plus2_sox.wav \
    --out /tmp/atlas_story_final_deep_slow.wav

This script requires: soundfile, numpy, scipy, sox (CLI) available.
It will:
 - detect low-amplitude regions to locate natural pauses (optional)
 - add fixed extra silence at commas and sentence ends by simple rule-based mapping
 - write an intermediate WAV
 - call sox to apply tempo, pitch, bass/treble and overdrive
"""

import argparse
import os
import subprocess
import tempfile
import hashlib
import soundfile as sf
import numpy as np
from scipy.signal import resample_poly


def add_silence_at_boundaries(y, sr, comma_extra=0.25, sentence_extra=0.6):
    # This is a heuristic: find zero-crossings near low-energy regions isn't reliable without alignment.
    # We'll instead insert silences after approximate positions by re-synthesizing the text timing is hard.
    # Simpler approach: split on longer pauses (silence segments) and after each silence, append extra silence
    # based on nearest punctuation mapping. But we don't have text-timestamp mapping here.
    # So fallback: increase all silences shorter than 0.5s by comma_extra, and silences between 0.5s and 1.5s by sentence_extra.

    # compute frame energy via short-time RMS
    frame_len = int(sr * 0.02)  # 20ms
    hop = int(frame_len // 2)
    if hop <= 0:
        hop = 256
    frames = []
    for i in range(0, max(1, len(y) - frame_len + 1), hop):
        f = y[i:i+frame_len]
        frames.append(np.sqrt(np.mean(f*f)))
    frames = np.array(frames)
    # threshold for silence
    thresh = np.percentile(frames, 10) * 1.2
    # mark silent frames
    silent = frames < thresh
    # merge contiguous silent frames into segments
    segs = []  # (start_sample, end_sample)
    i = 0
    n = len(frames)
    while i < n:
        if silent[i]:
            j = i
            while j < n and silent[j]:
                j += 1
            # convert frame idx to samples
            start = i*hop
            end = min(len(y), j*hop + frame_len)
            segs.append((start, end))
            i = j
        else:
            i += 1

    # build new signal with expanded silences
    out = []
    last = 0
    for (s,e) in segs:
        # append non-silent chunk before segment
        if s > last:
            out.append(y[last:s])
        seg_dur = (e - s) / sr
        extra = 0.0
        if seg_dur < 0.5:
            extra = comma_extra
        elif seg_dur < 1.5:
            extra = sentence_extra
        # append original silent chunk
        out.append(y[s:e])
        if extra > 0:
            out.append(np.zeros(int(round(extra * sr)), dtype=y.dtype))
        last = e
    if last < len(y):
        out.append(y[last:])
    if not out:
        return y
    return np.concatenate(out)


def sox_process(inpath, outpath, tempo=0.75, pitch_semitones=-4, overdrive_db=6, bass_gain=8, treble_gain=-4, compand=None):
    # pitch in cents for sox
    cents = int(round(pitch_semitones * 100))
    # base effects list: tempo (preserve pitch) then pitch shift
    effects = ['tempo', '-s', str(tempo), 'pitch', str(cents)]
    # overdrive / saturation
    if overdrive_db and overdrive_db > 0:
        effects += ['overdrive', str(overdrive_db)]
    # optional compander to make voice thicker
    if compand:
        effects += compand
    # bass/treble shaping: sox expects gain [frequency [width]]
    if bass_gain is not None:
        effects += ['bass', str(bass_gain)]
    if treble_gain is not None:
        effects += ['treble', str(treble_gain)]

    cmd = ['sox', inpath, '--no-dither', outpath] + effects
    print('Running:', ' '.join(cmd))
    subprocess.check_call(cmd)


def md5_and_duration(path):
    import soundfile as sf, hashlib
    y, sr = sf.read(path, dtype='float32')
    dur = len(y)/sr
    md5 = hashlib.md5(open(path,'rb').read()).hexdigest()
    return md5, round(dur, 2), sr


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--in', dest='infile', required=True)
    p.add_argument('--out', dest='outfile', required=True)
    p.add_argument('--tmp', dest='tmpdir')
    p.add_argument('--style', choices=['neutral','rough','very_rough'], help='Processing style preset')
    p.add_argument('--tempo', type=float, help='Manual tempo override (e.g. 0.75)')
    p.add_argument('--pitch', type=float, help='Manual pitch semitones override (negative = lower)')
    p.add_argument('--overdrive', type=float, help='Manual overdrive db')
    p.add_argument('--bass', type=float, help='Manual bass gain')
    p.add_argument('--treble', type=float, help='Manual treble gain')
    args = p.parse_args()

    tmpdir = args.tmpdir or tempfile.mkdtemp(prefix='atlas_pauses_')
    os.makedirs(tmpdir, exist_ok=True)

    print('Loading', args.infile)
    y, sr = sf.read(args.infile, dtype='float32')
    if y.ndim > 1:
        y = y.mean(axis=1)

    print('Original sr=', sr, 'len=', len(y))
    # ensure 44100
    if sr != 44100:
        print('Resampling from', sr, 'to 44100')
        from math import gcd
        up = 44100
        down = sr
        g = gcd(up, down)
        up //= g
        down //= g
        y = resample_poly(y, up, down)
        sr = 44100

    print('Adding pause expansions...')
    y2 = add_silence_at_boundaries(y, sr, comma_extra=0.25, sentence_extra=0.6)
    inter = os.path.join(tmpdir, 'with_pauses.wav')
    sf.write(inter, y2, sr, subtype='PCM_24')
    print('Wrote intermediate with pauses to', inter)

    # choose preset parameters by style
    style = getattr(args, 'style', 'neutral')
    if style == 'neutral':
        tempo = 0.78
        pitch = -3
        overdrive = 6
        bass = 6
        treble = -3
        compand = None
    elif style == 'rough':
        tempo = 0.75
        pitch = -4
        overdrive = 9
        bass = 8
        treble = -4
        compand = None
    elif style == 'very_rough':
        tempo = 0.72
        pitch = -5
        overdrive = 12
        bass = 10
        treble = -6
        compand = None
    else:
        # allow numeric override via CLI
        tempo = args.tempo if args.tempo else 0.75
        pitch = args.pitch if args.pitch is not None else -4
        overdrive = args.overdrive if args.overdrive is not None else 8
        bass = args.bass if args.bass is not None else 8
        treble = args.treble if args.treble is not None else -4
        compand = None

    print('Running SoX processing (style=', style, ')...')
    sox_process(inter, args.outfile, tempo=tempo, pitch_semitones=pitch, overdrive_db=overdrive, bass_gain=bass, treble_gain=treble, compand=compand)

    md5_i, dur_i, _ = md5_and_duration(inter)
    md5_o, dur_o, sr_o = md5_and_duration(args.outfile)
    print('Intermediate:', inter, 'md5=', md5_i, 'dur=', dur_i)
    print('Final:', args.outfile, 'md5=', md5_o, 'dur=', dur_o, 'sr=', sr_o)


if __name__ == '__main__':
    main()
