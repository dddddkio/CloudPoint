"""Object-range reads used by the large point-cloud rendering path."""

import pytest

from app import storage


class RangeResponse:
    def __init__(self, data: bytes):
        self.data = data
        self.closed = False
        self.released = False

    def read(self):
        return self.data

    def close(self):
        self.closed = True

    def release_conn(self):
        self.released = True


class RangeClient:
    def __init__(self, payloads: list[bytes]):
        self.payloads = list(payloads)
        self.calls = 0
        self.responses = []

    def get_object(self, *_args, **_kwargs):
        self.calls += 1
        response = RangeResponse(self.payloads.pop(0))
        self.responses.append(response)
        return response


def test_read_range_retries_an_incomplete_internal_transfer(monkeypatch):
    client = RangeClient([b"abc", b"abcdef"])
    monkeypatch.setattr(storage, "get_client", lambda: client)
    monkeypatch.setattr(storage.time, "sleep", lambda _seconds: None)

    result = storage.read_range("cloud/raw/file.las", 0, 6)

    assert result == b"abcdef"
    assert client.calls == 2
    assert all(response.closed and response.released for response in client.responses)


def test_read_range_fails_after_bounded_retries(monkeypatch):
    client = RangeClient([b"x", b"x", b"x"])
    monkeypatch.setattr(storage, "get_client", lambda: client)
    monkeypatch.setattr(storage.time, "sleep", lambda _seconds: None)

    with pytest.raises(IOError, match="expected 6, got 1"):
        storage.read_range("cloud/raw/file.las", 0, 6)

    assert client.calls == 3
