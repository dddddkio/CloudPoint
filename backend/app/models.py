"""Database models.

Only metadata + a pointer to the object-storage location is persisted here.
The point cloud binary itself lives in MinIO — never in the database
(explicit requirement of the brief).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PointCloud(Base):
    __tablename__ = "point_clouds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # --- user-facing metadata ---
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # --- object storage pointer (key within the bucket, NOT the bytes) ---
    raw_object_key: Mapped[str] = mapped_column(String(1024), nullable=False)

    # --- parsed LAS header info ---
    las_version: Mapped[str | None] = mapped_column(String(16), nullable=True)
    point_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    point_format: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_rgb: Mapped[bool | None] = mapped_column(nullable=True)
    min_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_z: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_z: Mapped[float | None] = mapped_column(Float, nullable=True)

    # --- lifecycle ---
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
