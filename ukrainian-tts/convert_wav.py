"""Simple WAV upsample and convert utility.

Usage:
    python3 convert_wav.py in.wav out.wav --sr 44100 --subtype PCM_24

This reads input WAV, optionally rescales (linear) to desired sample rate using librosa,
normalizes, and writes with requested subtype.
"""
import argparse
import soundfile as sf
import librosa
import numpy as np


def convert(infile, outfile, sr=44100, subtype='PCM_24'):
    audio, src_sr = sf.read(infile, dtype='float32')
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr != src_sr:
        audio = librosa.resample(audio, orig_sr=src_sr, target_sr=sr)
    # normalize
    peak = float(np.max(np.abs(audio)) or 1.0)
    audio = (audio / peak) * 0.95
    sf.write(outfile, audio, sr, subtype=subtype)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('infile')
    p.add_argument('outfile')
    p.add_argument('--sr', type=int, default=44100)
    p.add_argument('--subtype', default='PCM_24')
    args = p.parse_args()
    convert(args.infile, args.outfile, sr=args.sr, subtype=args.subtype)
