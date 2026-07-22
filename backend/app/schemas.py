"""Pydantic response/request schemas (the API contract)."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from .las import LasMetadata  # re-exported for API convenience

__all__ = ["BoundingBox", "PointCloudOut", "LasMetadata"]


class BoundingBox(BaseModel):
    min: list[float]  # [x, y, z]
    max: list[float]


class PointCloudOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    original_filename: str
    size_bytes: int
    las_version: str | None
    point_count: int | None
    point_format: int | None
    has_rgb: bool | None
    created_at: datetime
    bbox: BoundingBox | None = None
