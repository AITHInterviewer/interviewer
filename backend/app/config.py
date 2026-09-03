from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_FRONTEND_ORIGIN = "http://localhost:3000"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cors_origins: list[str] = [DEFAULT_FRONTEND_ORIGIN]


settings = Settings()
