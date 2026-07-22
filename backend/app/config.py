"""Application settings, loaded from environment / .env.

No secrets or absolute paths are hard-coded — everything comes from the
environment so the same image runs in dev, CI and prod.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+psycopg://cloudpoint:change_me@localhost:5432/cloudpoint"

    # Object storage (MinIO / S3)
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "cloudpoint"
    minio_secret_key: str = "change_me_too"
    minio_secure: bool = False
    minio_bucket: str = "pointclouds"

    # App
    cors_origins: str = "http://localhost:5173"
    max_upload_mb: int = 500

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
