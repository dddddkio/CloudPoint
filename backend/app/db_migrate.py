"""Run Alembic migrations programmatically on app startup.

Keeps the running database schema in sync with the committed migrations in
`migrations/versions/` — no manual `alembic upgrade` step needed to boot.
"""
from pathlib import Path

from alembic import command
from alembic.config import Config

_BACKEND_DIR = Path(__file__).resolve().parent.parent


def upgrade_to_head() -> None:
    cfg = Config(str(_BACKEND_DIR / "alembic.ini"))
    # Use absolute paths so this works regardless of the process CWD.
    cfg.set_main_option("script_location", str(_BACKEND_DIR / "migrations"))
    # The running application already owns logging configuration.
    cfg.attributes["skip_logging_config"] = True
    command.upgrade(cfg, "head")
