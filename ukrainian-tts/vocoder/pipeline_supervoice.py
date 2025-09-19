"""Pipeline: TTS text -> mel -> neural vocoder -> mastered WAV

Goal: produce a surprisingly high-quality result by combining the existing
TTS frontend (one of `ukrainian-tts-mps` or `ukrainian-tts` packages) with a
high-quality pretrained vocoder (HiFi-GAN / ParallelWaveGAN).

Behavior:
- If `--text` is passed, the script tries to import a local TTS package and
  synthesize audio (prefers `ukrainian-tts-mps` if found).
- If `--wav` is passed, it uses that WAV as the starting audio.
- Extracts mel-spectrogram using standard HiFi-GAN settings (80 mels, 1024 n_fft,
  hop_length 256) and saves `mel.npy`.
- Invokes the vocoder wrapper `ukrainian_tts.vocoder.infer` (must be installed
  / available) or instructs the user to run it manually.
- Postprocesses the resulting WAV: peak normalize to -0.5 dBFS, resample to
  44100 Hz and write PCM_24.

Usage examples:
python ukrainian-tts/vocoder/pipeline_supervoice.py --text "Привіт" --voice dmytro --checkpoint /path/to/hifigan.pth --out out_super.wav

python ukrainian-tts/vocoder/pipeline_supervoice.py --wav example.wav --checkpoint /path/to/hifigan.pth --out out_super.wav
"""

import argparse
import importlib
import os
import sys
import tempfile
import numpy as np
import soundfile as sf


def find_tts_package():
    # First, try to import an installed `ukrainian_tts` from site-packages
    try:
        spec = importlib.util.find_spec('ukrainian_tts')
        if spec is not None:
            try:
                pkg = importlib.import_module('ukrainian_tts')
                from ukrainian_tts.tts import TTS  # type: ignore
                return TTS
            except Exception:
                # installed package exists but failed to provide TTS; fallthrough
                pass
    except Exception:
        pass

    # Fall back to local folders commonly used in this repo (for dev copies).
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    candidates = [
        os.path.join(repo_root, 'ukrainian-tts-mps'),
        os.path.join(repo_root, 'ukrainian-tts'),
    ]
    for c in candidates:
        if os.path.isdir(c) and c not in sys.path:
            sys.path.insert(0, c)

    # Try to import again (local copy)
    try:
        pkg = importlib.import_module('ukrainian_tts')
        try:
            from ukrainian_tts.tts import TTS  # type: ignore
            return TTS
        except Exception:
            return None
    except Exception:
        return None


def synthesize_text_to_wav(TTSClass, text, voice, stress, device, out_wav):
    # Instantiate TTS and call tts -> write WAV to out_wav
    # Some TTSClass implementations use signature TTS(device=...) while
    # others (installed package) use TTS(cache_folder=None, device=...).
    try:
        tts = TTSClass(device=device)
    except TypeError:
        try:
            tts = TTSClass(None, device)
        except Exception:
            # Last resort: call without args
            tts = TTSClass()
    # tts.tts may accept a file path or a file-like object. Try file path
    # first for simplicity; if the implementation expects a file-like object
    # (raises an AttributeError on the string, e.g. 'str' object has no
    # attribute 'seek'), retry using an in-memory BytesIO and persist the
    # resulting bytes to `out_wav`.
    try:
        res, ok = tts.tts(text, voice, stress, out_wav)
    except Exception as e:
        msg = str(e) if e is not None else ''
        # Heuristic: if the error mentions 'seek' or the exception is
        # AttributeError, assume tts wants a file-like object and retry.
        if isinstance(e, AttributeError) or 'seek' in msg or 'file-like' in msg:
            import io
            buf = io.BytesIO()
            res, ok = tts.tts(text, voice, stress, buf)
            if not ok:
                raise RuntimeError(f"TTS synthesis failed: {res}")
            # write buffer to disk
            buf.seek(0)
            with open(out_wav, 'wb') as f:
                f.write(buf.read())
            return out_wav
        # Unknown error, re-raise for visibility
        raise

    if not ok:
        raise RuntimeError(f"TTS synthesis failed: {res}")
    return out_wav


def wav_to_mel(wav_path, sr=22050, n_fft=1024, hop_length=256, n_mels=80):
    import librosa
    y, orig_sr = sf.read(wav_path, dtype='float32')
    if y.ndim > 1:
        y = y.mean(axis=1)
    if orig_sr != sr:
        y = librosa.resample(y, orig_sr, sr)
    # librosa power mel (use keyword arg for y for compatibility with newer librosa)
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=n_fft, hop_length=hop_length, n_mels=n_mels, power=1.0)
    # convert to log scale (what most vocoders expect)
    mel = np.log(np.clip(mel, a_min=1e-9, a_max=None))
    return mel, sr


def normalize_peak(y, peak_db=-0.5):
    # scale y to peak_db dBFS (peak_db negative)
    peak = max(1e-9, float(np.max(np.abs(y))))
    target = 10 ** (peak_db / 20.0)
    return (y / peak) * target


def run_vocoder_infer(mel_path, checkpoint, out_wav, sr=22050):
    # Try to call the infer module programmatically
    try:
        mod = importlib.import_module('ukrainian_tts.vocoder.infer')
    except Exception:
        # fallback to executing the infer script directly using the same Python
        infer_py = os.path.join(os.path.dirname(__file__), 'infer.py')

        # If the user provided a checkpoint path that doesn't exist (common when
        # the downloaded archive extracted into a nested folder), try to locate
        # the actual file by searching the top-level model directory for a file
        # with the same basename.
        resolved_checkpoint = checkpoint
        if checkpoint and not os.path.exists(checkpoint):
            print('Checkpoint not found at provided path:', checkpoint)
            # Search under repo_root/model for the basename
            repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
            model_root = os.path.join(repo_root, 'ukrainian-tts-mps', 'model')
            base = os.path.basename(checkpoint)
            print('Searching for', base, 'under', model_root)
            for root, dirs, files in os.walk(model_root):
                if base in files:
                    candidate = os.path.join(root, base)
                    print('Found checkpoint at', candidate)
                    resolved_checkpoint = candidate
                    break
            if not os.path.exists(resolved_checkpoint):
                print('Could not resolve checkpoint automatically, will attempt with original path.')

        cmd = f"{sys.executable} {infer_py} --mel {mel_path} --checkpoint {resolved_checkpoint} --out {out_wav} --sr {sr}"
        print('Calling vocoder as subprocess:\n', cmd)
        rc = os.system(cmd)
        if rc != 0:
            raise RuntimeError('Vocoder infer subprocess failed')
        return out_wav

    # prefer hifigan backend if available
    if hasattr(mod, 'infer_hifigan'):
        mod.infer_hifigan(np.load(mel_path), checkpoint, out_wav, sr=sr)
        return out_wav
    if hasattr(mod, 'infer_pwgan'):
        mod.infer_pwgan(np.load(mel_path), checkpoint, out_wav, sr=sr)
        return out_wav

    raise RuntimeError('No infer function available in ukrainian_tts.vocoder.infer')


def main():
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument('--text', help='Text to synthesize')
    g.add_argument('--wav', help='Existing WAV to use as source')
    p.add_argument('--voice', default='dmytro')
    p.add_argument('--stress', default='dictionary')
    p.add_argument('--device', default='mps', help='Device for TTS (mps/cpu)')
    p.add_argument('--checkpoint', help='Path to vocoder checkpoint (required to run vocoder)')
    p.add_argument('--out', required=True, help='Output WAV path (final mastered WAV)')
    p.add_argument('--tmpdir', help='Temporary directory to use')
    args = p.parse_args()

    tmpdir = args.tmpdir or tempfile.mkdtemp(prefix='supervoice_')
    print('Using tmpdir:', tmpdir)

    source_wav = None
    if args.text:
        TTSClass = find_tts_package()
        if TTSClass is None:
            raise RuntimeError('Could not find a local ukrainian_tts package. Ensure ukrainian-tts-mps or ukrainian-tts is available in the repository.')
        source_wav = os.path.join(tmpdir, 'tts_out.wav')
        print('Synthesizing text to', source_wav)
        synthesize_text_to_wav(TTSClass, args.text, args.voice, args.stress, args.device, source_wav)
    else:
        source_wav = args.wav
        if not os.path.exists(source_wav):
            raise FileNotFoundError(f'Source wav not found: {source_wav}')

    print('Extracting mel...')
    mel, sr = wav_to_mel(source_wav)
    mel_path = os.path.join(tmpdir, 'mel.npy')
    np.save(mel_path, mel)
    print('Saved mel to', mel_path, 'shape', mel.shape)

    if not args.checkpoint:
        print('\nNo vocoder checkpoint provided. To get the best quality, provide a HiFi-GAN or ParallelWaveGAN checkpoint.\n')
        print('Example (HiFi-GAN): --checkpoint /path/to/hifigan_generator.pth')
        print('You can still run the vocoder manually with:')
        print(f'python -m ukrainian_tts.vocoder.infer --mel {mel_path} --checkpoint <checkpoint.pth> --out {args.out} --sr {sr}')
        return

    print('Running vocoder infer...')
    voc_out = os.path.join(tmpdir, 'vocoder_out.wav')
    run_vocoder_infer(mel_path, args.checkpoint, voc_out, sr=sr)
    print('Vocoder wrote', voc_out)

    # Postprocess: read, normalize, resample to 44.1k PCM_24
    print('Postprocessing: normalize and resample to 44.1k PCM_24')
    import librosa
    from scipy.signal import resample_poly
    y, sr_in = sf.read(voc_out, dtype='float32')
    if y.ndim > 1:
        y = y.mean(axis=1)
    target_sr = 44100
    if sr_in != target_sr:
        # Use scipy.signal.resample_poly for robust resampling (avoids librosa API
        # compatibility issues across versions). resample_poly expects (x, up, down).
        # Compute integer up/down factors approximating the ratio.
        from math import gcd
        up = target_sr
        down = sr_in
        g = gcd(up, down)
        up //= g
        down //= g
        if y.ndim == 1:
            y = resample_poly(y, up, down)
        else:
            # apply per-channel
            y = np.stack([resample_poly(y[:, i], up, down) for i in range(y.shape[1])], axis=1)
    y = normalize_peak(y, peak_db=-0.5)
    sf.write(args.out, y, target_sr, subtype='PCM_24')
    print('Wrote final mastered WAV to', args.out)


if __name__ == '__main__':
    main()
