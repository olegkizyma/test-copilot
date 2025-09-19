from setuptools import setup, find_packages

setup(
    name="ukrainian-tts",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        'torch>=1.10.0',
        'numpy>=1.20.0',
        'librosa>=0.9.2',
        'soundfile>=0.10.3',
        'scipy>=1.7.0',
        'flask>=2.0.0',
    ],
    python_requires='>=3.8',
)
