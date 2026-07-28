"""MinIO object-storage wrapper.

Point cloud binaries live here — the DB only stores object keys. Credentials
come from the environment (never hard-coded).
"""
from __future__ import annotations

import io
import time

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


def delete_object(object_key: str) -> None:
    """Remove one raw point-cloud object from the configured private bucket."""
    get_client().remove_object(settings.minio_bucket, object_key)


def stat_object(object_key: str):
    return get_client().stat_object(settings.minio_bucket, object_key)


def read_range(
    object_key: str,
    offset: int,
    length: int,
    max_attempts: int = 3,
) -> bytes:
    """Read a complete object range, retrying interrupted internal transfers."""
    last_error: Exception | None = None

    for attempt in range(max_attempts):
        response = None
        try:
            response = get_client().get_object(
                settings.minio_bucket,
                object_key,
                offset=offset,
                length=length,
            )
            data = response.read()
            if len(data) != length:
                raise IOError(
                    f"Object range was truncated: expected {length}, got {len(data)}"
                )
            return data
        except Exception as exc:
            last_error = exc
            if attempt + 1 < max_attempts:
                time.sleep(0.15 * (attempt + 1))
        finally:
            if response is not None:
                response.close()
                response.release_conn()

    assert last_error is not None
    raise last_error


def presigned_get(
    object_key: str,
    expires_seconds: int = 3600,
    response_headers: dict[str, str] | None = None,
) -> str:
    """Return a temporary download URL the browser can fetch directly."""
    from datetime import timedelta

    return get_client().presigned_get_object(
        settings.minio_bucket,
        object_key,
        expires=timedelta(seconds=expires_seconds),
        response_headers=response_headers,
    )
