"""LAS file validation & metadata extraction.

This is the core business logic the brief calls out: an upload must be
*proven* to be a valid LAS file, not merely trusted by its extension.

We parse the LAS public header block directly per the ASPRS LAS spec so the
check is cheap (header only, no full point read) and fully unit-testable
without external services. `laspy` is available for richer parsing if needed.

Public header layout (offsets, all little-endian):
    0    4s   File Signature — must be b"LASF"
    24   B    Version Major
    25   B    Version Minor
    104  B    Point Data Record Format
    105  H    Point Data Record Length
    107  I    Legacy Number of Point Records (LAS <= 1.3, or 0 in 1.4)
    179  d    Max X   187  d Min X
    195  d    Max Y   203  d Min Y
    211  d    Max Z   219  d Min Z
    247  Q    Number of Point Records (LAS 1.4)
"""
from __future__ import annotations

import math
import struct

from pydantic import BaseModel

LAS_SIGNATURE = b"LASF"
_MIN_HEADER_BYTES = 227  # smallest legacy public header (LAS 1.0/1.2)

# Point data record formats that carry RGB colour.
_RGB_FORMATS = {2, 3, 5, 7, 8, 10}
_MIN_POINT_RECORD_LENGTHS = {
    0: 20,
    1: 28,
    2: 26,
    3: 34,
    4: 57,
    5: 63,
    6: 30,
    7: 36,
    8: 38,
    9: 59,
    10: 67,
}


class InvalidLasError(ValueError):
    """Raised when the supplied bytes are not a valid LAS file."""


class LasMetadata(BaseModel):
    """Result of parsing a LAS header — the core validated payload."""
    las_version: str
    point_count: int
    point_format: int
    has_rgb: bool
    min_x: float
    min_y: float
    min_z: float
    max_x: float
    max_y: float
    max_z: float


def _u8(buf: bytes, off: int) -> int:
    return struct.unpack_from("<B", buf, off)[0]


def _u16(buf: bytes, off: int) -> int:
    return struct.unpack_from("<H", buf, off)[0]


def _u32(buf: bytes, off: int) -> int:
    return struct.unpack_from("<I", buf, off)[0]


def _u64(buf: bytes, off: int) -> int:
    return struct.unpack_from("<Q", buf, off)[0]


def _f64(buf: bytes, off: int) -> float:
    return struct.unpack_from("<d", buf, off)[0]


def parse_las_header(
    header: bytes,
    *,
    file_size: int | None = None,
) -> LasMetadata:
    """Validate and extract metadata from a LAS public header block.

    `header` should contain at least the first ~256 bytes of the file.
    Raises InvalidLasError on anything that is not a well-formed LAS header.
    """
    if len(header) < _MIN_HEADER_BYTES:
        raise InvalidLasError("File too small to contain a LAS header.")

    if header[0:4] != LAS_SIGNATURE:
        raise InvalidLasError('Missing LAS file signature "LASF".')

    major = _u8(header, 24)
    minor = _u8(header, 25)
    if major != 1 or minor > 4:
        raise InvalidLasError(f"Unsupported LAS version {major}.{minor}.")

    point_format_raw = _u8(header, 104)
    point_format = point_format_raw & 0x3F  # high bits are compression flags
    if point_format_raw != point_format:
        raise InvalidLasError("Compressed LAZ point data is not supported.")
    if point_format not in _MIN_POINT_RECORD_LENGTHS:
        raise InvalidLasError(f"Unsupported LAS point format {point_format}.")

    point_length = _u16(header, 105)
    if point_length < _MIN_POINT_RECORD_LENGTHS[point_format]:
        raise InvalidLasError(
            f"Point record length {point_length} is too small for format "
            f"{point_format}."
        )

    legacy_count = _u32(header, 107)
    point_count = legacy_count
    if minor >= 4 and len(header) >= 255:
        count_1_4 = _u64(header, 247)
        if count_1_4:
            point_count = count_1_4

    if point_count <= 0:
        raise InvalidLasError("LAS file reports zero points.")

    max_x, min_x = _f64(header, 179), _f64(header, 187)
    max_y, min_y = _f64(header, 195), _f64(header, 203)
    max_z, min_z = _f64(header, 211), _f64(header, 219)
    if not all(
        math.isfinite(value)
        for value in (min_x, min_y, min_z, max_x, max_y, max_z)
    ):
        raise InvalidLasError("LAS bounding box contains a non-finite value.")
    if min_x > max_x or min_y > max_y or min_z > max_z:
        raise InvalidLasError("LAS bounding box is inverted (min > max).")

    if file_size is not None:
        header_size = _u16(header, 94)
        point_data_offset = _u32(header, 96)
        if header_size < _MIN_HEADER_BYTES or point_data_offset < header_size:
            raise InvalidLasError("LAS point data offset is invalid.")
        expected_end = point_data_offset + point_count * point_length
        if expected_end > file_size:
            raise InvalidLasError(
                "LAS point data is truncated relative to its header metadata."
            )

    return LasMetadata(
        las_version=f"{major}.{minor}",
        point_count=point_count,
        point_format=point_format,
        has_rgb=point_format in _RGB_FORMATS,
        min_x=min_x, min_y=min_y, min_z=min_z,
        max_x=max_x, max_y=max_y, max_z=max_z,
    )
