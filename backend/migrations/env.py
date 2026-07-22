"""Alembic migration environment.

Pulls the DB URL from the app settings (backend/.env) and the target schema
from the app's SQLAlchemy metadata, so `--autogenerate` diffs migrations
against the ORM models automatically.
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Import app metadata + settings. All models must be imported so they register
# on Base.metadata before autogenerate runs.
from app.config import get_settings
from app.database import Base
import app.models  # noqa: F401  (registers PointCloud on Base.metadata)

config = context.config

# Inject the real DB URL from settings (never hard-coded in alembic.ini).
config.set_main_option("sqlalchemy.url", get_settings().database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
