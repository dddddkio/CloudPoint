"""Cloudflare Access identity verification for protected API routes."""
from __future__ import annotations

from functools import lru_cache
import logging
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient
from jwt.exceptions import PyJWTError
from pydantic import BaseModel

from .config import Settings, get_settings

logger = logging.getLogger(__name__)


class AccessIdentity(BaseModel):
    email: str
    name: str
    role: str = "Workspace reviewer"
    auth_type: str = "cloudflare_access"


@lru_cache(maxsize=4)
def get_jwks_client(certs_url: str) -> PyJWKClient:
    """Reuse Cloudflare signing keys and refresh them when their key ID rotates."""
    return PyJWKClient(certs_url, cache_keys=True, lifespan=300)


def verify_cloudflare_access_token(token: str, settings: Settings) -> AccessIdentity:
    """Verify signature, issuer, audience and lifetime of an Access application JWT."""
    if not settings.cf_access_issuer or not settings.cf_access_audience:
        logger.error("Cloudflare Access authentication is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is not configured.",
        )

    try:
        signing_key = get_jwks_client(settings.cf_access_certs_url).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.cf_access_audience,
            issuer=settings.cf_access_issuer,
            options={"require": ["exp", "iat", "iss", "aud", "sub", "email"]},
        )
    except PyJWTError as exc:
        logger.warning("Cloudflare Access token rejected", extra={"reason": type(exc).__name__})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cloudflare Access authentication is invalid or expired.",
        ) from exc
    except Exception as exc:
        logger.exception("Cloudflare Access signing keys could not be loaded")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable.",
        ) from exc

    email = str(claims["email"]).strip().lower()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cloudflare Access identity does not include an email.",
        )

    return AccessIdentity(
        email=email,
        name=str(claims.get("name") or email.split("@", 1)[0]),
    )


def require_access_identity(
    cf_access_jwt_assertion: Annotated[
        str | None,
        Header(alias="Cf-Access-Jwt-Assertion"),
    ] = None,
    settings: Settings = Depends(get_settings),
) -> AccessIdentity:
    """Resolve a trusted reviewer identity or reject the API request."""
    if settings.auth_mode == "development":
        if settings.environment != "development":
            logger.error("Development authentication was enabled outside development")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication configuration is unsafe.",
            )
        return AccessIdentity(
            email="local-reviewer@cloudpoint.test",
            name="Local Reviewer",
            role="Workspace editor",
            auth_type="development",
        )

    if not cf_access_jwt_assertion:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cloudflare Access authentication is required.",
        )

    return verify_cloudflare_access_token(cf_access_jwt_assertion, settings)
