"""HTTP middleware shared by all API routes."""
from __future__ import annotations

import logging
import re
import time
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from .logging_config import request_id_context

logger = logging.getLogger("cloudpoint.access")
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


def _request_id(request: Request) -> str:
    supplied = request.headers.get("X-Request-ID", "")
    return supplied if _VALID_REQUEST_ID.fullmatch(supplied) else str(uuid.uuid4())


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Add request metadata, access logs and safe 500 responses."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        request_id = _request_id(request)
        token = request_id_context.set(request_id)
        started = time.perf_counter()
        status_code = 500

        try:
            try:
                response = await call_next(request)
                status_code = response.status_code
            except Exception:
                logger.exception(
                    "Unhandled request error",
                    extra={"method": request.method, "path": request.url.path},
                )
                response = JSONResponse(
                    status_code=500,
                    content={
                        "detail": "Internal server error",
                        "request_id": request_id,
                    },
                )

            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time-Ms"] = str(duration_ms)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "no-referrer"

            log_method = logger.warning if status_code >= 500 else logger.info
            log_method(
                "Request completed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": status_code,
                    "duration_ms": duration_ms,
                    "client_ip": request.client.host if request.client else None,
                },
            )
            return response
        finally:
            request_id_context.reset(token)
