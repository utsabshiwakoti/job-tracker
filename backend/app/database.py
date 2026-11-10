import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./jobtracker.db")

# check_same_thread is a SQLite-only option; FastAPI serves requests from a thread pool.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def ensure_schema(bind) -> None:
    """Create tables, then add columns introduced after the first release.

    create_all() never alters an existing table, so a database made by an older version
    would be missing new columns. This keeps upgrades painless without Alembic; switch to
    proper migrations if the schema keeps changing.
    """
    from sqlalchemy import inspect, text

    Base.metadata.create_all(bind=bind)
    existing = {c["name"] for c in inspect(bind).get_columns("applications")}
    with bind.begin() as conn:
        if "source" not in existing:
            conn.execute(text("ALTER TABLE applications ADD COLUMN source VARCHAR(50)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_applications_url ON applications (url)"))


def get_db():
    """FastAPI dependency: one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
