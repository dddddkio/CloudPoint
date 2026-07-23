"""FastAPI application entrypoint."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db_migrate import upgrade_to_head
from .logging_config import configure_logging
from .middleware import RequestLoggingMiddleware
from .routers import point_clouds, session, system

settings = get_settings()
configure_logging(settings.log_level, settings.log_format)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "Application starting",
        extra={"environment": settings.environment},
    )
    upgrade_to_head()
    # Alembic loads its own logging config; restore the application config.
    configure_logging(settings.log_level, settings.log_format)
    logger.info("Database migrations complete")
    try:
        yield
    finally:
        logger.info("Application stopped")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Upload, manage and view LAS point clouds.",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "service", "description": "Service metadata and health checks."},
        {"name": "session", "description": "Cloudflare Access reviewer identity."},
        {"name": "point-clouds", "description": "Point-cloud upload and retrieval."},
    ],
)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
    expose_headers=["X-Request-ID", "X-Process-Time-Ms"],
)

app.include_router(system.router)
app.include_router(session.router)
app.include_router(point_clouds.router)
