FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    git \
    curl \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    portaudio19-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/fish-speech

# v1.5.1: поддержка русского языка, совместима с fish-speech-1.5 чекпоинтами
RUN git clone --branch v1.5.1 --depth 1 https://github.com/fishaudio/fish-speech .

# funasr нужен только для ASR; делаем импорт опциональным, чтобы TTS работал без него
COPY docker/fish-speech/model_manager_patch.py tools/server/model_manager.py

# torch.compile(mode="reduce-overhead") captures a CUDA Graph around
# decode_one_token; the returned `codebooks` tensor lives in a graph-owned
# buffer that gets overwritten by the next decode step before the caller is
# done with it ("accessing tensor output of CUDAGraphs that has been
# overwritten"). Switch to mode="default" — still gets torch.compile's
# kernel fusion, without CUDA Graph capture, so no buffer aliasing.
RUN sed -i 's/mode="reduce-overhead" if torch.cuda.is_available() else None,/mode="default" if torch.cuda.is_available() else None,/' \
    fish_speech/models/text2semantic/inference.py

# torch 2.7+ с cu128 поддерживает Blackwell (sm_120, RTX 5070 Ti)
# --break-system-packages нужен для Ubuntu 24.04 (PEP 668)
RUN pip3 install --no-cache-dir --break-system-packages \
    "torch==2.7.1+cu128" "torchaudio==2.7.1+cu128" \
    --index-url https://download.pytorch.org/whl/cu128

# Зависимости API-сервера v1.5.1 (без funasr/modelscope/wandb/gradio/datasets).
# --only-binary=tokenizers: бинарный wheel, без компиляции Rust.
RUN pip3 install --no-cache-dir --break-system-packages --only-binary=tokenizers \
    "transformers>=4.45.2" \
    "numpy<2" \
    "einops>=0.7.0" \
    "librosa>=0.10.1" \
    "rich>=13.5.3" \
    "hydra-core>=1.3.2" \
    "loguru>=0.6.0" \
    "vector_quantize_pytorch==1.14.24" \
    "einx[torch]==0.2.2" \
    "ormsgpack" \
    "pydantic==2.9.2" \
    "cachetools" \
    "zstandard>=0.22.0" \
    "lightning>=2.1.0" \
    "tiktoken>=0.8.0" \
    "natsort>=8.4.0" \
    "resampy>=0.4.3" \
    "pyrootutils>=1.0.4" \
    "loralib>=0.1.2" \
    "grpcio>=1.58.0" \
    "kui>=1.6.0" \
    "uvicorn>=0.30.0" \
    "silero-vad" \
    "opencc-python-reimplemented==0.1.7"

# Устанавливаем пакет fish-speech без deps (уже установлены выше)
RUN pip3 install --no-cache-dir --break-system-packages --no-deps -e .

EXPOSE 8080

CMD ["python3", "tools/api_server.py", \
     "--listen", "0.0.0.0:8080", \
     "--llama-checkpoint-path", "checkpoints/fish-speech-1.5", \
     "--decoder-checkpoint-path", "checkpoints/fish-speech-1.5/firefly-gan-vq-fsq-8x1024-21hz-generator.pth", \
     "--decoder-config-name", "firefly_gan_vq", \
     "--compile"]
