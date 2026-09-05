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

    # LiveKit (specs/004-candidate-interview-flow, contracts/livekit-token.md) — backend
    # выпускает access token кандидату, secret никогда не уходит на frontend. Dev-значения
    # по умолчанию совпадают с infra/livekit.yaml —
    # НЕ для прода, см. комментарий в том файле.
    livekit_api_key: str = "devkey"
    livekit_api_secret: str = "dev-secret-change-me-32-characters"
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

    # Публичный URL фронтенда — используется для сборки кандидатской ссылки
    # (`{public_frontend_url}/interview/{access_token}`, см. `interview_admin_service.py`),
    # тот же env-переменной уже читает `scripts/seed_demo_interview.py` через os.environ.
    public_frontend_url: str = "http://localhost:3000"

    # CORS
    cors_origins: list[str] = []

    # Evaluation-agent service-to-service auth
    evaluation_service_token: str = "dev-evaluation-token"

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
