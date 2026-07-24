"""Current Cloudflare Access session endpoint."""
from fastapi import APIRouter, Depends

from ..config import Settings, get_settings
from ..security import AccessIdentity, require_access_identity

router = APIRouter(prefix="/api/session", tags=["session"])


class SessionOut(AccessIdentity):
    max_upload_mb: int


@router.get("", response_model=SessionOut, summary="Current authenticated identity")
def current_session(
    identity: AccessIdentity = Depends(require_access_identity),
    settings: Settings = Depends(get_settings),
) -> SessionOut:
    return SessionOut(
        **identity.model_dump(),
        max_upload_mb=settings.max_upload_mb,
    )
