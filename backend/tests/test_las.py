"""Unit tests for the core LAS validation logic.

These cover the brief's key requirement: a file must be *proven* a valid LAS,
so both the happy path and several rejection paths are exercised.
"""
import struct

import pytest

from app.las import InvalidLasError, parse_las_header


def build_las_header(
    *,
    signature: bytes = b"LASF",
    major: int = 1,
    minor: int = 2,
    point_format: int = 3,
    point_length: int = 34,
    point_count: int = 1000,
    bbox=((0.0, 0.0, 0.0), (10.0, 20.0, 30.0)),
) -> bytes:
    """Craft a minimal but spec-conformant LAS 1.2-style public header."""
    (min_x, min_y, min_z), (max_x, max_y, max_z) = bbox
    buf = bytearray(300)
    buf[0:4] = signature
    struct.pack_into("<B", buf, 24, major)
    struct.pack_into("<B", buf, 25, minor)
    struct.pack_into("<H", buf, 94, 227)
    struct.pack_into("<I", buf, 96, 227)
    struct.pack_into("<B", buf, 104, point_format)
    struct.pack_into("<H", buf, 105, point_length)
    struct.pack_into("<I", buf, 107, point_count)
    struct.pack_into("<d", buf, 179, max_x)
    struct.pack_into("<d", buf, 187, min_x)
    struct.pack_into("<d", buf, 195, max_y)
    struct.pack_into("<d", buf, 203, min_y)
    struct.pack_into("<d", buf, 211, max_z)
    struct.pack_into("<d", buf, 219, min_z)
    return bytes(buf)


def test_valid_las_with_rgb():
    meta = parse_las_header(build_las_header(point_format=3))
    assert meta.las_version == "1.2"
    assert meta.point_count == 1000
    assert meta.point_format == 3
    assert meta.has_rgb is True
    assert meta.min_x == 0.0 and meta.max_z == 30.0


def test_valid_las_without_rgb():
    meta = parse_las_header(build_las_header(point_format=1))
    assert meta.has_rgb is False


def test_rejects_bad_signature():
    with pytest.raises(InvalidLasError, match="signature"):
        parse_las_header(build_las_header(signature=b"NOPE"))


def test_rejects_unsupported_version():
    with pytest.raises(InvalidLasError, match="Unsupported"):
        parse_las_header(build_las_header(major=2, minor=0))


def test_rejects_zero_points():
    with pytest.raises(InvalidLasError, match="zero points"):
        parse_las_header(build_las_header(point_count=0))


def test_rejects_inverted_bbox():
    with pytest.raises(InvalidLasError, match="inverted"):
        parse_las_header(build_las_header(bbox=((10.0, 0.0, 0.0), (0.0, 20.0, 30.0))))


def test_rejects_truncated_file():
    with pytest.raises(InvalidLasError, match="too small"):
        parse_las_header(b"LASF" + b"\x00" * 10)


def test_rejects_truncated_point_payload():
    header = build_las_header(point_count=10, point_length=34)
    with pytest.raises(InvalidLasError, match="truncated"):
        parse_las_header(header, file_size=300)


def test_rejects_point_record_shorter_than_format_requires():
    with pytest.raises(InvalidLasError, match="too small"):
        parse_las_header(build_las_header(point_format=3, point_length=20))


def test_accepts_complete_point_payload():
    header = build_las_header(point_count=2, point_length=34)
    meta = parse_las_header(header, file_size=227 + 2 * 34)
    assert meta.point_count == 2
