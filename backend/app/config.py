from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Application
    app_env: str = "development"
    app_debug: bool = False

    app_host: str = "0.0.0.0"
    app_port: int = 8000

    secret_key: str = "development-secret-key"
    jwt_secret: str = "development-jwt-secret"
    jwt_access_token_expire_minutes: int = 60

    # PostgreSQL
    postgres_db: str = "ainterviewer"
    postgres_host: str = "localhost"
    postgres_user: str = "ainterviewer"
    postgres_password: str = "ainterviewer"

    database_url: str = "sqlite+aiosqlite:///./app.db"

    # Redis
    redis_host: str = "redis"
    redis_port: int = 6379

    redis_url: str = "redis://localhost:6379/0"

    # Celery
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"

    celery_task_always_eager: bool = False
    celery_task_track_started: bool = True

    # MinIO
    minio_root_user: str = "ainterviewer"
    minio_root_password: str = "ainterviewer123"
    minio_bucket: str = "interviews"

    # S3
    s3_endpoint_url: str = "http://localhost:9000"
    s3_public_endpoint_url: str = "http://localhost:9000"

    s3_access_key: str = "ainterviewer"
    s3_secret_key: str = "ainterviewer123"

    s3_bucket: str = "interviews"
    s3_region: str = "us-east-1"

    # Media
    media_chunk_duration_seconds: int = Field(default=10, gt=0)
    max_upload_size_mb: int = Field(default=100, gt=0)

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
