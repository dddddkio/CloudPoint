"""Point cloud upload / list / detail endpoints."""
from __future__ import annotations

import logging
import math
import struct
import uuid
from collections.abc import Iterator
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import storage
from ..config import get_settings
from ..database import get_db
from ..las import InvalidLasError, parse_las_header
from ..models import PointCloud
from ..schemas import BoundingBox, PointCloudOut
from ..security import require_access_identity

router = APIRouter(
    prefix="/api/point-clouds",
    tags=["point-clouds"],
    dependencies=[Depends(require_access_identity)],
)
settings = get_settings()
logger = logging.getLogger(__name__)

_HEADER_PROBE_BYTES = 4096  # enough to cover any LAS public header + VLR start
_MAX_RENDER_POINTS = 2_000_000
_SAMPLE_WINDOW_COUNT = 64


def _to_out(pc: PointCloud) -> PointCloudOut:
    out = PointCloudOut.model_validate(pc)
    if pc.min_x is not None and pc.max_x is not None:
        out.bbox = BoundingBox(
            min=[pc.min_x, pc.min_y, pc.min_z],
            max=[pc.max_x, pc.max_y, pc.max_z],
        )
    return out


def _sample_windows(total_points: int, target_points: int) -> list[tuple[int, int]]:
    """Spread bounded, contiguous point windows across the complete LAS."""
    if total_points <= target_points:
        return [(0, total_points)]

    window_count = min(_SAMPLE_WINDOW_COUNT, target_points)
    points_per_window = math.ceil(target_points / window_count)
    max_start = max(total_points - points_per_window, 0)
    windows: list[tuple[int, int]] = []
    remaining = target_points

    for index in range(window_count):
        if remaining <= 0:
            break
        length = min(points_per_window, remaining)
        start = (
            0
            if window_count == 1
            else round(index * max_start / (window_count - 1))
        )
        windows.append((start, length))
        remaining -= length
    return windows


def _sample_header(header: bytes, sample_count: int) -> bytes:
    """Create a compact LAS header whose point data starts immediately after it."""
    header_size = struct.unpack_from("<H", header, 94)[0]
    compact = bytearray(header[:header_size])
    if len(compact) < 227:
        raise InvalidLasError("LAS public header is truncated.")

    minor = compact[25]
    struct.pack_into("<I", compact, 96, header_size)
    struct.pack_into("<I", compact, 100, 0)  # sampled stream contains no VLRs

    if minor >= 4:
        if len(compact) < 255:
            raise InvalidLasError("LAS 1.4 public header is truncated.")
        struct.pack_into("<I", compact, 107, 0)
        struct.pack_into("<Q", compact, 235, 0)  # first EVLR offset
        struct.pack_into("<I", compact, 243, 0)  # EVLR count
        struct.pack_into("<Q", compact, 247, sample_count)
    else:
        struct.pack_into("<I", compact, 107, sample_count)
    return bytes(compact)


@router.post("", response_model=PointCloudOut, status_code=status.HTTP_201_CREATED)
async def upload_point_cloud(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> PointCloudOut:
    contents = await file.read()

    if len(contents) > settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds {settings.max_upload_mb} MB limit.",
        )

    # --- validate it's a real LAS file (not just a .las name) ---
    try:
        meta = parse_las_header(
            contents[:_HEADER_PROBE_BYTES],
            file_size=len(contents),
        )
    except InvalidLasError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    cloud_id = str(uuid.uuid4())
    original_filename = (
        (file.filename or "unnamed.las")
        .replace("\\", "/")
        .rsplit("/", 1)[-1]
        .strip()
    ) or "unnamed.las"
    raw_key = f"{cloud_id}/raw/{original_filename}"

    storage.ensure_bucket()
    storage.put_bytes(raw_key, contents, content_type="application/octet-stream")

    pc = PointCloud(
        id=cloud_id,
        original_filename=original_filename,
        size_bytes=len(contents),
        raw_object_key=raw_key,
        las_version=meta.las_version,
        point_count=meta.point_count,
        point_format=meta.point_format,
        has_rgb=meta.has_rgb,
        min_x=meta.min_x, min_y=meta.min_y, min_z=meta.min_z,
        max_x=meta.max_x, max_y=meta.max_y, max_z=meta.max_z,
    )
    try:
        db.add(pc)
        db.commit()
    except Exception:
        db.rollback()
        try:
            storage.delete_object(raw_key)
        except Exception:
            logger.exception(
                "Failed to remove an orphaned upload after database failure",
                extra={"object_key": raw_key},
            )
        raise
    db.refresh(pc)
    return _to_out(pc)


@router.get("", response_model=list[PointCloudOut])
def list_point_clouds(db: Session = Depends(get_db)) -> list[PointCloudOut]:
    rows = db.execute(select(PointCloud).order_by(PointCloud.created_at.desc())).scalars().all()
    return [_to_out(pc) for pc in rows]


@router.get("/{cloud_id}", response_model=PointCloudOut)
def get_point_cloud(cloud_id: str, db: Session = Depends(get_db)) -> PointCloudOut:
    pc = db.get(PointCloud, cloud_id)
    if pc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Point cloud not found.")
    return _to_out(pc)


@router.get("/{cloud_id}/download-url")
def get_download_url(
    cloud_id: str,
    download: bool = Query(False),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Temporary presigned URL for the raw LAS (used by the viewer/fallback)."""
    pc = db.get(PointCloud, cloud_id)
    if pc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Point cloud not found.")
    response_headers = None
    if download:
        encoded_name = quote(pc.original_filename, safe="")
        response_headers = {
            "response-content-disposition": (
                f"attachment; filename*=UTF-8''{encoded_name}"
            )
        }
    return {
        "url": storage.presigned_get(
            pc.raw_object_key,
            response_headers=response_headers,
        )
    }


@router.get("/{cloud_id}/render-sample")
def stream_render_sample(
    cloud_id: str,
    max_points: int = Query(
        _MAX_RENDER_POINTS,
        ge=10_000,
        le=_MAX_RENDER_POINTS,
    ),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Stream a representative LAS sample without downloading the full object."""
    pc = db.get(PointCloud, cloud_id)
    if pc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Point cloud not found.")

    try:
        object_size = storage.stat_object(pc.raw_object_key).size
        header_probe = storage.read_range(
            pc.raw_object_key,
            0,
            min(_HEADER_PROBE_BYTES, object_size),
        )
        meta = parse_las_header(header_probe)
    except InvalidLasError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except Exception as exc:
        logger.exception(
            "Point-cloud render header could not be loaded",
            extra={"cloud_id": cloud_id},
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Point cloud storage could not prepare the viewer.",
        ) from exc

    available_points = max(
        0,
        (object_size - meta.point_data_offset) // meta.point_record_length,
    )
    readable_points = min(meta.point_count, available_points)
    if readable_points <= 0:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "LAS file contains no complete point records.",
        )

    windows = _sample_windows(readable_points, max_points)
    sample_count = sum(length for _, length in windows)
    try:
        compact_header = _sample_header(header_probe, sample_count)
    except InvalidLasError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    def generate() -> Iterator[bytes]:
        yield compact_header
        for point_start, point_count in windows:
            offset = meta.point_data_offset + point_start * meta.point_record_length
            length = point_count * meta.point_record_length
            chunk = storage.read_range(pc.raw_object_key, offset, length)
            if len(chunk) != length:
                raise RuntimeError(
                    f"Object range was truncated: expected {length}, got {len(chunk)}"
                )
            yield chunk

    content_length = len(compact_header) + sample_count * meta.point_record_length
    return StreamingResponse(
        generate(),
        media_type="application/vnd.las",
        headers={
            "Content-Length": str(content_length),
            "Cache-Control": "private, no-store",
            "X-CloudPoint-Sampled": "true",
            "X-Original-Point-Count": str(meta.point_count),
        },
    )


@router.delete(
    "/{cloud_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_point_cloud(
    cloud_id: str,
    db: Session = Depends(get_db),
) -> Response:
    """Delete the raw object and its metadata record as one user action."""
    pc = db.get(PointCloud, cloud_id)
    if pc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Point cloud not found.")

    try:
        storage.delete_object(pc.raw_object_key)
    except Exception as exc:
        logger.exception(
            "Point-cloud object could not be deleted",
            extra={"cloud_id": cloud_id},
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Point cloud storage could not complete the deletion.",
        ) from exc

    try:
        db.delete(pc)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Metadata deletion failed after object removal",
            extra={"cloud_id": cloud_id},
        )
        raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)
