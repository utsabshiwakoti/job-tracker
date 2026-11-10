import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture()
def client():
    # In-memory SQLite shared across threads; fresh database for every test.
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # Not using `with TestClient(...)`, so the lifespan (which touches the real DB) is skipped.
    yield TestClient(app)
    app.dependency_overrides.clear()


def register_and_login(client, email="a@example.com", password="correct-horse"):
    client.post("/api/auth/register", json={"email": email, "password": password})
    res = client.post("/api/auth/token", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture()
def auth(client):
    return register_and_login(client)
