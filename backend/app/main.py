"""FastAPI application entrypoint."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db_migrate import upgrade_to_head
from .routers import point_clouds

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Apply any pending Alembic migrations so the schema is always at head.
    upgrade_to_head()
    yield


app = FastAPI(title="CloudPoint API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(point_clouds.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
