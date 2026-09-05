"""Retry-обёртка вокруг multipart /v1/audio/transcriptions у faster-whisper-server —
тот же принцип, что и `ensure_tts_model.py` для TTS (см. его докстринг): большая модель
на этой сети периодически не докачивается с HF CDN, единственный надёжный способ
проверить готовность — реально дёрнуть эндпоинт синтеза/транскрипции.

Запуск: python3 ensure_stt_model.py <base_url> <model_id>
"""

from __future__ import annotations

import struct
import sys
import time
import urllib.error
import urllib.request
import uuid

RETRIES = 6
DELAY_SECONDS = 20


def _make_silence_wav(seconds: float = 0.5, sample_rate: int = 16000) -> bytes:
    """Real (non-empty) 16-bit mono PCM silence — a zero-length `data` chunk risks a
    separate "empty audio" validation error unrelated to what this script tests."""
    n_samples = int(seconds * sample_rate)
    data = b"\x00\x00" * n_samples
    byte_rate = sample_rate * 2
    fmt_chunk = struct.pack("<HHIIHH", 1, 1, sample_rate, byte_rate, 2, 16)
    riff_size = 4 + (8 + len(fmt_chunk)) + (8 + len(data))
    return (
        b"RIFF" + struct.pack("<I", riff_size) + b"WAVE"
        + b"fmt " + struct.pack("<I", len(fmt_chunk)) + fmt_chunk
        + b"data" + struct.pack("<I", len(data)) + data
    )


_SILENCE_WAV = _make_silence_wav()


def _post_multipart(url: str, model: str, timeout: int = 180) -> tuple[int, bytes]:
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="model"\r\n\r\n{model}\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="silence.wav"\r\n'
        f"Content-Type: audio/wav\r\n\r\n"
    ).encode() + _SILENCE_WAV + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main() -> int:
    base_url, model_id = sys.argv[1], sys.argv[2]

    for attempt in range(1, RETRIES + 1):
        print(f"[{attempt}/{RETRIES}] POST /v1/audio/transcriptions (model={model_id}) ...", flush=True)
        status, body = _post_multipart(f"{base_url}/v1/audio/transcriptions", model_id)
        if status == 200:
            print(f"  -> {status}, модель реально готова: {body[:200]!r}", flush=True)
            return 0
        print(f"  -> {status}: {body[:400]!r}", flush=True)

        if attempt < RETRIES:
            print(f"не готово, повтор через {DELAY_SECONDS}с...", flush=True)
            time.sleep(DELAY_SECONDS)

    print("STT-модель так и не скачалась после всех попыток", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
