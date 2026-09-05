"""Загрузка резюме кандидата в S3/MinIO — `boto3` (новая зависимость, синхронная), поэтому
вызов обёрнут в `asyncio.to_thread`, чтобы не блокировать event loop FastAPI.

Использует уже существующий, но пока нигде не задействованный `settings.s3_*` (заведён
раньше под этот же MinIO, см. `app/config.py`).
"""

from __future__ import annotations

import asyncio
import uuid

import boto3
from fastapi import UploadFile

from app.config import settings


def _put_object_sync(key: str, content: bytes, content_type: str | None) -> None:
    client = boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
    )
    client.put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=content,
        ContentType=content_type or "application/octet-stream",
    )


async def upload_resume(file: UploadFile) -> str:
    content = await file.read()
    key = f"resumes/{uuid.uuid4()}-{file.filename or 'resume'}"
    await asyncio.to_thread(_put_object_sync, key, content, file.content_type)
    return f"{settings.s3_public_endpoint_url}/{settings.s3_bucket}/{key}"
