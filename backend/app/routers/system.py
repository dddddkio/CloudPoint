"""Service metadata and operational health endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from .. import storage
from ..config import get_settings
from ..database import engine

router = APIRouter(tags=["service"])
settings = get_settings()
logger = logging.getLogger(__name__)


@router.get("/", summary="Service information")
def service_info() -> dict[str, object]:
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "status": "running",
        "links": {
            "docs": "/docs",
            "openapi": "/openapi.json",
            "health": "/health/live",
            "readiness": "/health/ready",
        },
    }


@router.get("/health", summary="Legacy liveness check")
@router.get("/health/live", summary="Liveness check")
def liveness() -> dict[str, str]:
    """Confirms that the API process can serve requests."""
    return {"status": "ok"}


@router.get("/health/ready", summary="Dependency readiness check")
def readiness(response: Response) -> dict[str, object]:
    """Checks whether PostgreSQL and object storage are available."""
    checks: dict[str, str] = {}

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "unavailable"
        logger.exception("Database readiness check failed")

    try:
        client = storage.get_client()
        checks["object_storage"] = (
            "ok" if client.bucket_exists(settings.minio_bucket) else "unavailable"
        )
    except Exception:
        checks["object_storage"] = "unavailable"
        logger.exception("Object storage readiness check failed")

    ready = all(value == "ok" for value in checks.values())
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ready" if ready else "not_ready", "checks": checks}
