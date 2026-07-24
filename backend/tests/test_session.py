"""Session contract tests."""
from app.config import Settings
from app.routers.session import current_session
from app.security import AccessIdentity


def test_session_exposes_server_upload_limit():
    identity = AccessIdentity(
        email="reviewer@example.com",
        name="Review User",
    )
    settings = Settings(
        environment="development",
        auth_mode="development",
        max_upload_mb=95,
    )

    session = current_session(identity=identity, settings=settings)

    assert session.email == "reviewer@example.com"
    assert session.max_upload_mb == 95
