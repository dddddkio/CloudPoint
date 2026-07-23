"""Download-link behavior for contextual file actions."""
from types import SimpleNamespace

from app.routers import point_clouds


class Database:
    def get(self, _model, _cloud_id):
        return SimpleNamespace(
            raw_object_key="cloud-id/raw/scan with spaces.las",
            original_filename="scan with spaces.las",
        )


def test_attachment_download_url_sets_safe_content_disposition(monkeypatch):
    captured = {}

    def presigned_get(object_key, response_headers=None):
        captured["object_key"] = object_key
        captured["response_headers"] = response_headers
        return "https://storage.example/signed"

    monkeypatch.setattr(point_clouds.storage, "presigned_get", presigned_get)

    result = point_clouds.get_download_url(
        "cloud-id",
        download=True,
        db=Database(),
    )

    assert result == {"url": "https://storage.example/signed"}
    assert captured["object_key"] == "cloud-id/raw/scan with spaces.las"
    assert captured["response_headers"] == {
        "response-content-disposition": (
            "attachment; filename*=UTF-8''scan%20with%20spaces.las"
        )
    }


def test_viewer_download_url_remains_inline(monkeypatch):
    captured = {}

    def presigned_get(_object_key, response_headers=None):
        captured["response_headers"] = response_headers
        return "https://storage.example/signed"

    monkeypatch.setattr(point_clouds.storage, "presigned_get", presigned_get)

    point_clouds.get_download_url(
        "cloud-id",
        download=False,
        db=Database(),
    )

    assert captured["response_headers"] is None
