ukrainian-tts vocoder wrapper

This folder contains a minimal wrapper for running a neural vocoder (HiFi-GAN or ParallelWaveGAN) on mel-spectrograms produced by the TTS model.

Quick start

1) Install dependencies (recommended in a single project-local virtualenv)

# Recommendation: create one venv for VOCODER work under the folder `ukrainian-tts-mps/venv`.
# This keeps dependencies in one place and avoids mixing with other project venvs.

python -m venv ukrainian-tts-mps/venv
source ukrainian-tts-mps/venv/bin/activate
python -m pip install -U pip wheel setuptools
python -m pip install numpy soundfile librosa

# choose one vocoder implementation (parallel-wavegan is pip-installable and a reliable choice):
python -m pip install parallel-wavegan

# If you must use HiFi-GAN from source, clone it and adapt the import path (the upstream repo is
# not shipped as a pip package):
# git clone https://github.com/jik876/hifi-gan.git
# cd hifi-gan
# # then either install locally or add the hifi-gan path to PYTHONPATH before running infer
# python -m pip install -e .  # only if the repo provides setup.py / pyproject.toml

2) Run inference

# mel: numpy array with shape (n_mel, T) saved with np.save('mel.npy', mel)
python -m ukrainian_tts.vocoder.infer --mel mel.npy --checkpoint path/to/checkpoint.pth --out out.wav --sr 22050

Notes

- The wrapper is intentionally minimal and expects a checkpoint format compatible with the chosen vocoder:
  - HiFi-GAN: checkpoint containing `generator` state_dict (common convention)
  - ParallelWaveGAN: checkpoint in the format used by parallel_wavegan (see their docs)

- MPS / macOS notes:
  - HiFi-GAN / PWGAN are PyTorch-based. On macOS with MPS, ensure your PyTorch is MPS-enabled and that model tensors are float32.
  - If running on MPS, prefer casting inputs and model to float32 before moving to device.

- If you don't have a mel file, you can modify `ukrainian_tts` TTS pipeline to dump mel outputs (search for `mel` in codebase).

Troubleshooting

- Import errors: install missing packages into the active virtualenv.
- Checkpoint keys mismatch: inspect the checkpoint with `torch.load(checkpoint)` and adapt loading code accordingly.

License: MIT (same as project)
