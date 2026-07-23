"""Point cloud upload / list / detail endpoints."""
from __future__ import annotations

import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
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

_HEADER_PROBE_BYTES = 4096  # enough to cover any LAS public header + VLR start


def _to_out(pc: PointCloud) -> PointCloudOut:
    out = PointCloudOut.model_validate(pc)
    if pc.min_x is not None and pc.max_x is not None:
        out.bbox = BoundingBox(
            min=[pc.min_x, pc.min_y, pc.min_z],
            max=[pc.max_x, pc.max_y, pc.max_z],
        )
    return out


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
        meta = parse_las_header(contents[:_HEADER_PROBE_BYTES])
    except InvalidLasError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    cloud_id = str(uuid.uuid4())
    raw_key = f"{cloud_id}/raw/{file.filename}"

    storage.ensure_bucket()
    storage.put_bytes(raw_key, contents, content_type="application/octet-stream")

    pc = PointCloud(
        id=cloud_id,
        original_filename=file.filename or "unnamed.las",
        size_bytes=len(contents),
        raw_object_key=raw_key,
        las_version=meta.las_version,
        point_count=meta.point_count,
        point_format=meta.point_format,
        has_rgb=meta.has_rgb,
        min_x=meta.min_x, min_y=meta.min_y, min_z=meta.min_z,
        max_x=meta.max_x, max_y=meta.max_y, max_z=meta.max_z,
    )
    db.add(pc)
    db.commit()
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
