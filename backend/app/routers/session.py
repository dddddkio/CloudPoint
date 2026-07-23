"""Current Cloudflare Access session endpoint."""
from fastapi import APIRouter, Depends

from ..security import AccessIdentity, require_access_identity

router = APIRouter(prefix="/api/session", tags=["session"])


@router.get("", response_model=AccessIdentity, summary="Current authenticated identity")
def current_session(
    identity: AccessIdentity = Depends(require_access_identity),
) -> AccessIdentity:
    return identity
