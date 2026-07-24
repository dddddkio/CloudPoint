"""Tests for logging, request metadata and operational endpoints."""
import json
import logging

from fastapi import FastAPI, Response
from fastapi.testclient import TestClient

from app.logging_config import JsonFormatter, request_id_context
from app.middleware import RequestLoggingMiddleware
from app.routers import system


def _middleware_test_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)

    @app.get("/ok")
    def ok() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/error")
    def error() -> None:
        raise RuntimeError("private failure detail")

    return app


def test_json_formatter_includes_standard_context():
    token = request_id_context.set("request-123")
    try:
        record = logging.LogRecord(
            "cloudpoint.test", logging.INFO, __file__, 1, "hello", (), None
        )
        record.request_id = request_id_context.get()
        payload = json.loads(JsonFormatter().format(record))
    finally:
        request_id_context.reset(token)

    assert payload["level"] == "INFO"
    assert payload["logger"] == "cloudpoint.test"
    assert payload["message"] == "hello"
    assert payload["request_id"] == "request-123"
    assert payload["timestamp"].endswith("+00:00")


def test_request_middleware_adds_observability_and_security_headers():
    with TestClient(_middleware_test_app()) as client:
        response = client.get("/ok", headers={"X-Request-ID": "caller-id"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "caller-id"
    assert float(response.headers["X-Process-Time-Ms"]) >= 0
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"


def test_unhandled_errors_are_safe_and_traceable():
    with TestClient(_middleware_test_app()) as client:
        response = client.get("/error")

    assert response.status_code == 500
    assert response.json() == {
        "detail": "Internal server error",
        "request_id": response.headers["X-Request-ID"],
    }
    assert "private failure detail" not in response.text


def test_service_info_and_liveness():
    info = system.service_info()
    assert info["status"] == "running"
    assert info["links"]["readiness"] == "/health/ready"
    assert system.liveness() == {"status": "ok"}


def test_readiness_reports_dependency_status(monkeypatch):
    class Result:
        def scalar_one_or_none(self):
            return "cloud-id/raw/sample.las"

    class Connection:
        def execute(self, _statement):
            return Result()

    class ConnectionContext:
        def __enter__(self):
            return Connection()

        def __exit__(self, *_args):
            return None

    class Engine:
        def connect(self):
            return ConnectionContext()

    class StorageClient:
        def bucket_exists(self, _bucket):
            return True

        def stat_object(self, bucket, object_key):
            assert bucket == system.settings.minio_bucket
            assert object_key == "cloud-id/raw/sample.las"

    monkeypatch.setattr(system, "engine", Engine())
    monkeypatch.setattr(system.storage, "get_client", lambda: StorageClient())

    response = Response()
    result = system.readiness(response)
    assert response.status_code == 200
    assert result == {
        "status": "ready",
        "checks": {"database": "ok", "object_storage": "ok"},
    }


def test_readiness_returns_503_when_database_is_unavailable(monkeypatch):
    class Engine:
        def connect(self):
            raise RuntimeError("database unavailable")

    class StorageClient:
        def bucket_exists(self, _bucket):
            return True

    monkeypatch.setattr(system, "engine", Engine())
    monkeypatch.setattr(system.storage, "get_client", lambda: StorageClient())

    response = Response()
    result = system.readiness(response)
    assert response.status_code == 503
    assert result["status"] == "not_ready"
    assert result["checks"]["database"] == "unavailable"


def test_readiness_returns_503_when_database_row_has_no_object(monkeypatch):
    class Result:
        def scalar_one_or_none(self):
            return "cloud-id/raw/missing.las"

    class Connection:
        def execute(self, _statement):
            return Result()

    class ConnectionContext:
        def __enter__(self):
            return Connection()

        def __exit__(self, *_args):
            return None

    class Engine:
        def connect(self):
            return ConnectionContext()

    class StorageClient:
        def bucket_exists(self, _bucket):
            return True

        def stat_object(self, _bucket, _object_key):
            raise RuntimeError("missing object")

    monkeypatch.setattr(system, "engine", Engine())
    monkeypatch.setattr(system.storage, "get_client", lambda: StorageClient())

    response = Response()
    result = system.readiness(response)
    assert response.status_code == 503
    assert result["status"] == "not_ready"
    assert result["checks"]["object_storage"] == "unavailable"
