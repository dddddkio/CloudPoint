"""Cloudflare Access authentication tests."""
import pytest
from fastapi import HTTPException

from app.config import Settings
from app import security


def cloudflare_settings() -> Settings:
    return Settings(
        auth_mode="cloudflare_access",
        environment="production",
        cf_access_team_domain="https://example.cloudflareaccess.com",
        cf_access_audience="app-audience",
    )


def test_development_mode_resolves_local_identity():
    settings = Settings(auth_mode="development", environment="development")
    identity = security.require_access_identity(settings=settings)

    assert identity.email == "local-reviewer@cloudpoint.test"
    assert identity.name == "Local Reviewer"
    assert identity.auth_type == "development"


def test_development_mode_is_rejected_outside_development():
    settings = Settings(auth_mode="development", environment="production")
    with pytest.raises(HTTPException) as exc:
        security.require_access_identity(settings=settings)
    assert exc.value.status_code == 503


def test_missing_cloudflare_assertion_is_rejected():
    with pytest.raises(HTTPException) as exc:
        security.require_access_identity(settings=cloudflare_settings())
    assert exc.value.status_code == 401


def test_verified_cloudflare_claims_resolve_identity(monkeypatch):
    class SigningKey:
        key = "public-key"

    class JwksClient:
        def get_signing_key_from_jwt(self, token):
            assert token == "access-jwt"
            return SigningKey()

    def decode(token, key, **kwargs):
        assert token == "access-jwt"
        assert key == "public-key"
        assert kwargs["algorithms"] == ["RS256"]
        assert kwargs["audience"] == "app-audience"
        assert kwargs["issuer"] == "https://example.cloudflareaccess.com"
        return {
            "sub": "reviewer-id",
            "email": "Reviewer@Example.com",
            "name": "Review User",
            "iss": kwargs["issuer"],
            "aud": [kwargs["audience"]],
            "iat": 1,
            "exp": 2,
        }

    monkeypatch.setattr(security, "get_jwks_client", lambda _url: JwksClient())
    monkeypatch.setattr(security.jwt, "decode", decode)

    identity = security.verify_cloudflare_access_token(
        "access-jwt",
        cloudflare_settings(),
    )

    assert identity.email == "reviewer@example.com"
    assert identity.name == "Review User"
    assert identity.auth_type == "cloudflare_access"


def test_invalid_cloudflare_assertion_is_rejected(monkeypatch):
    class JwksClient:
        def get_signing_key_from_jwt(self, _token):
            raise security.jwt.InvalidTokenError("bad token")

    monkeypatch.setattr(security, "get_jwks_client", lambda _url: JwksClient())

    with pytest.raises(HTTPException) as exc:
        security.verify_cloudflare_access_token(
            "invalid",
            cloudflare_settings(),
        )
    assert exc.value.status_code == 401
