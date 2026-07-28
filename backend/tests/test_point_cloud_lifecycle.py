"""Transactional upload cleanup and point-cloud deletion behavior."""
import asyncio
import io
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, UploadFile

from app.routers import point_clouds
from tests.test_las import build_las_header


def build_las_file() -> bytes:
    header = bytearray(build_las_header(point_count=2, point_length=34))
    return bytes(header[:227]) + bytes(2 * 34)


class UploadDatabase:
    def __init__(self, *, fail_commit: bool = False):
        self.fail_commit = fail_commit
        self.added = None
        self.rolled_back = False

    def add(self, value):
        self.added = value

    def commit(self):
        if self.fail_commit:
            raise RuntimeError("database unavailable")

    def rollback(self):
        self.rolled_back = True

    def refresh(self, _value):
        return None


def test_upload_removes_object_when_database_commit_fails(monkeypatch):
    uploaded_keys = []
    deleted_keys = []
    monkeypatch.setattr(point_clouds.storage, "ensure_bucket", lambda: None)
    monkeypatch.setattr(
        point_clouds.storage,
        "put_bytes",
        lambda object_key, _data, content_type: uploaded_keys.append(object_key),
    )
    monkeypatch.setattr(
        point_clouds.storage,
        "delete_object",
        lambda object_key: deleted_keys.append(object_key),
    )
    db = UploadDatabase(fail_commit=True)
    upload = UploadFile(filename="../../sample.las", file=io.BytesIO(build_las_file()))

    with pytest.raises(RuntimeError, match="database unavailable"):
        asyncio.run(point_clouds.upload_point_cloud(upload, db=db))

    assert db.rolled_back is True
    assert len(uploaded_keys) == 1
    assert deleted_keys == uploaded_keys
    assert uploaded_keys[0].endswith("/raw/sample.las")


class DeleteDatabase:
    def __init__(self, point_cloud):
        self.point_cloud = point_cloud
        self.deleted = None
        self.committed = False
        self.rolled_back = False

    def get(self, _model, _cloud_id):
        return self.point_cloud

    def delete(self, value):
        self.deleted = value

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def test_delete_removes_object_before_metadata(monkeypatch):
    cloud = SimpleNamespace(raw_object_key="cloud-id/raw/sample.las")
    db = DeleteDatabase(cloud)
    removed = []
    monkeypatch.setattr(
        point_clouds.storage,
        "delete_object",
        lambda object_key: removed.append(object_key),
    )

    result = point_clouds.delete_point_cloud("cloud-id", db=db)

    assert result.status_code == 204
    assert removed == ["cloud-id/raw/sample.las"]
    assert db.deleted is cloud
    assert db.committed is True


def test_delete_keeps_metadata_when_storage_fails(monkeypatch):
    cloud = SimpleNamespace(raw_object_key="cloud-id/raw/sample.las")
    db = DeleteDatabase(cloud)

    def fail_delete(_object_key):
        raise RuntimeError("storage unavailable")

    monkeypatch.setattr(point_clouds.storage, "delete_object", fail_delete)

    with pytest.raises(HTTPException) as exc:
        point_clouds.delete_point_cloud("cloud-id", db=db)

    assert exc.value.status_code == 502
    assert db.deleted is None
    assert db.committed is False


def test_delete_missing_record_returns_404():
    db = DeleteDatabase(None)
    with pytest.raises(HTTPException) as exc:
        point_clouds.delete_point_cloud("missing", db=db)
    assert exc.value.status_code == 404


def test_render_sample_windows_are_spread_and_bounded():
    windows = point_clouds._sample_windows(100_000_000, 2_000_000)

    assert len(windows) == 64
    assert sum(length for _, length in windows) == 2_000_000
    assert windows[0][0] == 0
    assert windows[-1][0] + windows[-1][1] <= 100_000_000
    assert all(start >= 0 and length > 0 for start, length in windows)


def test_render_sample_header_rewrites_point_count_and_data_offset():
    original = build_las_file()
    compact = point_clouds._sample_header(original, 1_250_000)
    view = memoryview(compact)

    assert int.from_bytes(view[96:100], "little") == 227
    assert int.from_bytes(view[100:104], "little") == 0
    assert int.from_bytes(view[107:111], "little") == 1_250_000
