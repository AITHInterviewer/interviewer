"""LiveKit Egress — запись комнаты интервью (Room Composite) в S3/MinIO.

`infra/livekit-egress-config.yaml` уже поднимает egress-воркер с дефолтным S3-выходом
(бакет `ainterviewer-recordings`, тот же MinIO, что и резюме) — по комментарию в том файле,
это была dev-заготовка, «НЕ проверена вживую», потому что backend ни разу не вызывал
Egress API. Этот модуль — тот самый вызов: `room_name` уже совпадает с `Interview.id`
(см. `livekit_tokens.py`), файл кладём по тому же id, чтобы не заводить отдельный маппинг.

`start_recording` вызывается из `candidate_interview.py` при первой выдаче LiveKit-токена,
`stop_recording` — из `interview_event_service.py` на `interview_completed`, до запуска
оценки. Egress-ошибки не должны ронять кандидатский флоу — это отдельный, не критичный
для самого интервью, канал.
"""

from __future__ import annotations

import asyncio

import boto3
from botocore.exceptions import ClientError
from livekit import api

from app.config import settings

RECORDING_KEY_TEMPLATE = "recordings/{interview_id}.mp4"


def _ensure_recordings_bucket_sync() -> None:
    """Egress сам не создаёт бакет (в отличие от `storage.py::upload_resume`, который
    делает это для резюме) — `infra/livekit-egress-config.yaml` прямо просит создать
    `ainterviewer-recordings` руками при первом поднятии. Проще подстраховаться тут же,
    тем же паттерном, чем полагаться на ручной шаг при каждом новом окружении."""
    client = boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
    )
    try:
        client.head_bucket(Bucket=settings.recordings_s3_bucket)
    except ClientError:
        try:
            client.create_bucket(Bucket=settings.recordings_s3_bucket)
        except ClientError as error:
            code = error.response.get("Error", {}).get("Code")
            if code not in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
                raise


class EgressError(Exception):
    """LiveKit Egress недоступен/вернул ошибку."""


def _client() -> api.LiveKitAPI:
    return api.LiveKitAPI(settings.livekit_api_url, settings.livekit_api_key, settings.livekit_api_secret)


def recording_key(interview_id: str) -> str:
    return RECORDING_KEY_TEMPLATE.format(interview_id=interview_id)


def recording_public_url(interview_id: str) -> str:
    return f"{settings.s3_public_endpoint_url}/{settings.recordings_s3_bucket}/{recording_key(interview_id)}"


async def start_recording(interview_id: str) -> str:
    """Запускает room composite egress, возвращает `egress_id` (нужен для `stop_recording`)."""
    lkapi = _client()
    try:
        await asyncio.to_thread(_ensure_recordings_bucket_sync)
        request = api.RoomCompositeEgressRequest(
            room_name=interview_id,
            file_outputs=[
                api.EncodedFileOutput(
                    filepath=recording_key(interview_id),
                    s3=api.S3Upload(
                        access_key=settings.s3_access_key,
                        secret=settings.s3_secret_key,
                        bucket=settings.recordings_s3_bucket,
                        endpoint=settings.s3_endpoint_url,
                        force_path_style=True,
                        region=settings.s3_region,
                    ),
                )
            ],
        )
        info = await lkapi.egress.start_room_composite_egress(request)
    except Exception as exc:  # noqa: BLE001 — сетевая/LiveKit-ошибка сворачивается в наш тип
        raise EgressError(f"не удалось запустить запись: {exc}") from exc
    finally:
        await lkapi.aclose()
    return info.egress_id


async def stop_recording(egress_id: str) -> None:
    lkapi = _client()
    try:
        await lkapi.egress.stop_egress(api.StopEgressRequest(egress_id=egress_id))
    except Exception as exc:  # noqa: BLE001
        raise EgressError(f"не удалось остановить запись: {exc}") from exc
    finally:
        await lkapi.aclose()
