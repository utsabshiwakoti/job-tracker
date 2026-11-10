import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///./jobtracker.db")
    # Hosts like Neon hand out "postgres://" or "postgresql://" URLs; tell SQLAlchemy to use
    # the psycopg 3 driver we install rather than looking for the older psycopg2.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = _database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

# check_same_thread is a SQLite-only option; FastAPI serves requests from a thread pool.
# pool_pre_ping replaces connections a hosted Postgres closed while the app was idle.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    pool_pre_ping=not IS_SQLITE,
)
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
