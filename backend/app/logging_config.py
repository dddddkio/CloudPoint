"""Application logging built on Python's standard logging package."""
from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime

request_id_context: ContextVar[str] = ContextVar("request_id", default="-")


class RequestContextFilter(logging.Filter):
    """Attach the current request ID to every application log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = request_id_context.get()
        return True


class JsonFormatter(logging.Formatter):
    """Emit one machine-readable JSON object per log line."""

    _EXTRA_FIELDS = (
        "request_id",
        "method",
        "path",
        "status_code",
        "duration_ms",
        "client_ip",
        "environment",
        "cloud_id",
        "source_bytes",
        "source_points",
        "sample_points",
        "sample_windows",
    )

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in self._EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value is not None and value != "-":
                payload[field] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str = "INFO", log_format: str = "json") -> None:
    """Configure application and server loggers with one consistent handler."""
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestContextFilter())

    if log_format.lower() == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s %(name)s "
                "request_id=%(request_id)s %(message)s"
            )
        )

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())

    # Route Uvicorn through the same handler and avoid duplicate access lines;
    # RequestLoggingMiddleware provides richer access logs below.
    for logger_name in ("uvicorn", "uvicorn.error"):
        logger = logging.getLogger(logger_name)
        logger.handlers = []
        logger.propagate = True
    logging.getLogger("uvicorn.access").disabled = True
    logging.captureWarnings(True)
