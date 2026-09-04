"""Retry-обёртка вокруг `POST /v1/models/{model_id}` у speaches (self-hosted TTS).

Реальный найденный баг (2026-09-04): скачивание бинарника модели (model.onnx) с
HuggingFace периодически рвётся с SSLEOFError на их CDN-хосте (us.aws.cdn.hf.co,
xet-bridge) — та же нестабильность сети, что уже ловили на STT (см.
docker-compose.yml, HF_HUB_DISABLE_XET/HF_HUB_DOWNLOAD_TIMEOUT). Там речь про
транспорт HTTP-запросов huggingface_hub, здесь же ронятся сами байты файла на
конкретном CDN edge — не лечится таймаутом/заголовком, только повтором. Сам
speaches НЕ ретраит скачивание — если model.onnx не долетел, /v1/audio/speech
после этого падает 500 (StopIteration: model.onnx не найден среди файлов модели)
даже когда /v1/models уже показывает модель "установленной" (остальные файлы
докачались). Единственный надёжный способ проверить, что модель РЕАЛЬНО готова —
позвать сам /v1/audio/speech и посмотреть на код ответа.

Запуск: python3 ensure_tts_model.py <base_url> <model_id> <voice>
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

RETRIES = 6
DELAY_SECONDS = 20


def _post(url: str, body: bytes | None = None, timeout: int = 180) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=body, method="POST")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main() -> int:
    base_url, model_id, voice = sys.argv[1], sys.argv[2], sys.argv[3]
    speech_body = json.dumps({"model": model_id, "voice": voice, "input": "тест готовности модели"}).encode()

    for attempt in range(1, RETRIES + 1):
        print(f"[{attempt}/{RETRIES}] POST /v1/models/{model_id} ...", flush=True)
        status, body = _post(f"{base_url}/v1/models/{model_id}")
        print(f"  -> {status}", flush=True)

        print(f"[{attempt}/{RETRIES}] проверка синтезом /v1/audio/speech ...", flush=True)
        status, body = _post(f"{base_url}/v1/audio/speech", speech_body)
        if status == 200:
            print(f"  -> {status}, модель реально готова ({len(body)} байт аудио)", flush=True)
            return 0
        print(f"  -> {status}: {body[:300]!r}", flush=True)

        if attempt < RETRIES:
            print(f"не готово, повтор через {DELAY_SECONDS}с...", flush=True)
            time.sleep(DELAY_SECONDS)

    print("TTS-модель так и не скачалась после всех попыток", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
