"""
Simple HiFi-GAN / ParallelWaveGAN inference wrapper.

Usage (after installing dependencies):

pip install git+https://github.com/jik876/hifi-gan.git
# or
pip install parallelwavegan

Example:
python -m ukrainian_tts.vocoder.infer \
  --mel path/to/mel.npy \
  --out out.wav \
  --checkpoint path/to/hifigan.pth

This script is intentionally minimal: it loads mel from a numpy file
and writes wav using soundfile. It supports two backends (hifigan, pwgan)
based on availability.
"""
import argparse
import numpy as np
import soundfile as sf

# Compatibility shim: some versions of scipy expose the kaiser window at
# scipy.signal.older locations; parallel_wavegan imports `from scipy.signal import kaiser`
# which can fail on newer SciPy. If kaiser is missing, expose it from
# scipy.signal.windows so downstream imports succeed.
try:
    import scipy.signal as _scipy_signal
    if not hasattr(_scipy_signal, 'kaiser'):
        try:
            import scipy.signal.windows as _scipy_windows
            _scipy_signal.kaiser = _scipy_windows.kaiser
        except Exception:
            # leave it; import error will surface later with clearer message
            pass
except Exception:
    # scipy may not be installed yet; the caller will get a clearer error
    pass


def _try_import_hifigan():
    try:
        from hifigan import utils as hifi_utils  # type: ignore
        return True
    except Exception:
        return False


def _try_import_pwgan():
    try:
        import parallel_wavegan as pw  # type: ignore
        return True
    except Exception:
        return False


def infer_hifigan(mel, checkpoint, out_path, sr=22050):
    # Minimal example using the hifigan repo API
    try:
        import torch
        from hifigan import Generator  # expects the repo API
    except Exception as e:
        raise RuntimeError("HiFi-GAN not available. Install with: pip install git+https://github.com/jik876/hifi-gan.git")

    device = torch.device('cpu')
    model = Generator()  # default config; replace with loading config if needed
    state = torch.load(checkpoint, map_location=device)
    model.load_state_dict(state['generator'])
    model.to(device).eval()

    with torch.no_grad():
        m = torch.from_numpy(mel).unsqueeze(0)
        wav = model(m).squeeze().cpu().numpy()
    sf.write(out_path, wav, sr)


def infer_pwgan(mel, checkpoint, out_path, sr=22050):
    try:
        import parallel_wavegan as pw
        import torch
    except Exception:
        raise RuntimeError("ParallelWaveGAN not available. Install with: pip install parallelwavegan")

    # Manually construct model from the config next to the checkpoint for robustness
    import os
    checkpoint = os.path.abspath(checkpoint)
    ck_dir = os.path.abspath(os.path.dirname(checkpoint))
    cfg_path = os.path.join(ck_dir, 'config.yml')
    stats_path = os.path.join(ck_dir, 'stats.h5')
    if not os.path.exists(cfg_path):
        raise FileNotFoundError(f"Missing config.yml next to checkpoint: looked in {ck_dir} -> {os.listdir(ck_dir)}")
    import yaml
    with open(cfg_path, 'r') as f:
        cfg_dict = yaml.load(f, Loader=yaml.Loader)

    # instantiate model class from parallel_wavegan.models
    import parallel_wavegan.models as pw_models
    generator_type = cfg_dict.get('generator_type', 'ParallelWaveGANGenerator')
    model_class = getattr(pw_models, generator_type)
    generator_params = {k.replace('upsample_kernal_sizes', 'upsample_kernel_sizes'): v for k, v in cfg_dict['generator_params'].items()}
    import torch as _torch
    model = model_class(**generator_params)

    ck = _torch.load(checkpoint, map_location='cpu')
    try:
        state_dict = ck['model']['generator']
    except Exception:
        state_dict = ck.get('generator', ck.get('state_dict', ck))
    model.load_state_dict(state_dict)

    if os.path.exists(stats_path):
        try:
            model.register_stats(stats_path)
        except Exception:
            pass

    vocoder = model
    try:
        vocoder.remove_weight_norm()
    except Exception:
        pass
    vocoder.eval()
    with torch.no_grad():
        import torch as _torch
        # Prepare mel tensor robustly: ensure float32, contiguous, correct shape
        m = _torch.from_numpy(mel)
        if m.dtype != _torch.float32:
            m = m.to(_torch.float32)
        # Expected shape for ParallelWaveGAN: (B, C, T) where C == n_mels
        if m.dim() == 2:
            m = m.unsqueeze(0)
        # If shape looks like (B, T, C) (time dimension before channel), permute to (B, C, T)
        if m.dim() == 3 and m.shape[1] > m.shape[2]:
            # Heuristic: if the first non-batch dim is larger than the second,
            # it's likely (B, T, C) so swap to (B, C, T)
            m = m.permute(0, 2, 1)
        m = m.contiguous()

        # Force CPU execution to avoid MPS/CUDA opcode mismatches for pad operations
        try:
            m = m.to('cpu')
            vocoder = vocoder.to('cpu')
        except Exception:
            pass

        # Log shapes/dtypes to aid debugging
        try:
            print('DEBUG vocoder input shape, dtype:', tuple(m.shape), m.dtype)
        except Exception:
            pass

        # Try inference; if a NotImplementedError about padding occurs, attempt
        # a simple fallback: add a batch/time-padding dimension or transpose.
        try:
            wav = vocoder.inference(m).squeeze().cpu().numpy()
        except NotImplementedError as e:
            print('Vocoder inference raised NotImplementedError:', e)
            # Attempt fallback: ensure 4D by unsqueezing channel dim (some models expect extra dims)
            try:
                mm = m.unsqueeze(-1) if m.dim() == 3 else m
                print('DEBUG attempting fallback with shape', tuple(mm.shape))
                wav = vocoder.inference(mm).squeeze().cpu().numpy()
            except Exception:
                # re-raise original error for visibility
                raise
    sf.write(out_path, wav, sr)


def infer_griffin(mel, out_path, sr=22050, n_fft=1024, hop_length=256, n_iter=60):
    """
    Simple Griffin-Lim fallback that converts a log-mel spectrogram back to
    waveform using librosa's mel_to_audio. This is lower quality but requires
    no external neural vocoder packages and is useful as a robust fallback.
    """
    try:
        import librosa
    except Exception:
        raise RuntimeError('librosa is required for Griffin-Lim fallback (pip install librosa)')

    # mel is expected to be log(mel_power); invert the log
    mel_lin = np.exp(mel)

    # librosa expects shape (n_mels, T) and power spectrogram
    # Use librosa.feature.inverse.mel_to_audio which runs Griffin-Lim internally
    wav = librosa.feature.inverse.mel_to_audio(mel_lin, sr=sr, n_fft=n_fft, hop_length=hop_length, power=1.0, n_iter=n_iter)
    sf.write(out_path, wav, sr)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--mel', required=True)
    p.add_argument('--checkpoint', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--sr', type=int, default=22050)
    p.add_argument('--method', choices=['auto', 'hifigan', 'pwgan', 'griffin'], default='auto',
                   help='Which vocoder backend to use. auto will pick an available backend (default: auto)')
    args = p.parse_args()

    mel = np.load(args.mel)

    method = args.method
    if method == 'auto':
        if _try_import_hifigan():
            method = 'hifigan'
        elif _try_import_pwgan():
            method = 'pwgan'
        else:
            method = 'griffin'

    if method == 'hifigan':
        infer_hifigan(mel, args.checkpoint, args.out, sr=args.sr)
        return
    if method == 'pwgan':
        infer_pwgan(mel, args.checkpoint, args.out, sr=args.sr)
        return
    if method == 'griffin':
        # checkpoint is ignored for griffin but keep argument for compatibility
        infer_griffin(mel, args.out, sr=args.sr)
        return

    raise RuntimeError(f'Unsupported vocoder method: {method}')


if __name__ == '__main__':
    main()
