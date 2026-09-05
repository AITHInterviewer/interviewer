"""Загрузка резюме кандидата в S3/MinIO — `boto3` (новая зависимость, синхронная), поэтому
вызов обёрнут в `asyncio.to_thread`, чтобы не блокировать event loop FastAPI.

Использует уже существующий, но пока нигде не задействованный `settings.s3_*` (заведён
раньше под этот же MinIO, см. `app/config.py`).
"""

from __future__ import annotations

import asyncio
import uuid

import boto3
from botocore.exceptions import ClientError
from fastapi import UploadFile

from app.config import settings


def _s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
    )


def _ensure_bucket(client) -> None:
    """MinIO/S3 не создают бакет сами — без этого первый же `put_object` падает с
    `NoSuchBucket` (найдено на практике: ни один из compose-файлов не заводит бакет,
    ни на self-hosted раннере, ни локально)."""
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        try:
            client.create_bucket(Bucket=settings.s3_bucket)
        except ClientError as error:
            code = error.response.get("Error", {}).get("Code")
            if code not in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
                raise


def _put_object_sync(key: str, content: bytes, content_type: str | None) -> None:
    client = _s3_client()
    _ensure_bucket(client)
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
