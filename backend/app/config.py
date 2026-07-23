"""Application settings, loaded from environment / .env.

No secrets or absolute paths are hard-coded — everything comes from the
environment so the same image runs in dev, CI and prod.
"""
from functools import lru_cache
from typing import Literal

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
    app_name: str = "CloudPoint API"
    app_version: str = "0.1.0"
    environment: str = "development"
    log_level: str = "INFO"
    log_format: str = "json"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    max_upload_mb: int = 500
    auth_mode: Literal["cloudflare_access", "development"] = "cloudflare_access"
    cf_access_team_domain: str = ""
    cf_access_audience: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def cf_access_issuer(self) -> str:
        domain = self.cf_access_team_domain.strip().rstrip("/")
        if domain and not domain.startswith(("http://", "https://")):
            domain = f"https://{domain}"
        return domain

    @property
    def cf_access_certs_url(self) -> str:
        return f"{self.cf_access_issuer}/cdn-cgi/access/certs"


@lru_cache
def get_settings() -> Settings:
    return Settings()
