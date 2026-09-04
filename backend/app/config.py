from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Application
    app_env: str = "development"
    app_debug: bool = False

    app_host: str
    app_port: int = 8000

    secret_key: str

    # PostgreSQL
    postgres_db: str
    postgres_host: str
    postgres_user: str
    postgres_password: str

    database_url: str

    # Redis
    redis_host: str = "redis"
    redis_port: int = 6379

    redis_url: str

    # Celery
    celery_broker_url: str
    celery_result_backend: str

    celery_task_always_eager: bool = False
    celery_task_track_started: bool = True

    # MinIO
    minio_root_user: str
    minio_root_password: str
    minio_bucket: str = "interviews"

    # S3
    s3_endpoint_url: str
    s3_public_endpoint_url: str

    s3_access_key: str
    s3_secret_key: str

    s3_bucket: str = "interviews"
    s3_region: str = "us-east-1"

    # Media
    media_chunk_duration_seconds: int = Field(default=10, gt=0)
    max_upload_size_mb: int = Field(default=100, gt=0)

    # LiveKit (specs/004-candidate-interview-flow, contracts/livekit-token.md) — backend
    # выпускает access token кандидату, secret никогда не уходит на frontend. Dev-значения
    # по умолчанию совпадают с infra/docker-compose.yml (LIVEKIT_KEYS=devkey: secret) —
    # НЕ для прода, см. комментарий в том файле.
    livekit_api_key: str = "devkey"
    livekit_api_secret: str = "secret"
    livekit_ws_url: str = "ws://localhost:3907"

    # STT/TTS — те же self-hosted сервисы, что у live-контура
    # (live-agent/docker-compose.yml). Используются только mock-контуром
    # (app/routers/mock_interview.py) для ручной проверки голосового цикла; боевой путь
    # ходит в них из live-agent напрямую, не через backend.
    stt_base_url: str = "http://localhost:3905/v1"
    stt_model: str = "Systran/faster-whisper-medium"
    stt_language: str = "ru"
    tts_base_url: str = "http://localhost:3906/v1"
    tts_model: str = "speaches-ai/piper-ru_RU-irina-medium"
    tts_voice: str = "irina"

    # HTTP-драйвер графа live-контура (live-agent/src/ainterviewer/mock_driver.py) —
    # источник решений о переходах для mock-флоу. Backend только проксирует к нему.
    live_agent_driver_url: str = "http://localhost:3909"

    # CORS
    cors_origins: list[str] = []

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()