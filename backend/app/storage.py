"""MinIO object-storage wrapper.

Point cloud binaries live here — the DB only stores object keys. Credentials
come from the environment (never hard-coded).
"""
from __future__ import annotations

import io

from minio import Minio

from .config import get_settings

settings = get_settings()

_client: Minio | None = None


def get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
    return _client


def ensure_bucket() -> None:
    client = get_client()
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


def put_bytes(object_key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    client = get_client()
    client.put_object(
        settings.minio_bucket,
        object_key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def presigned_get(object_key: str, expires_seconds: int = 3600) -> str:
    """Return a temporary download URL the browser can fetch directly."""
    from datetime import timedelta

    return get_client().presigned_get_object(
        settings.minio_bucket, object_key, expires=timedelta(seconds=expires_seconds)
    )
