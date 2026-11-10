from datetime import date

from sqlalchemy import create_engine, inspect, text

from app.database import ensure_schema
from app.urls import normalize_url

from .conftest import register_and_login

LI_URL = "https://www.linkedin.com/jobs/view/4012345678/"
JOB = {"url": LI_URL, "company": "Acme", "title": "Junior Developer", "source": "linkedin"}


def capture(client, auth, **overrides):
    return client.post("/api/applications/capture", json={**JOB, **overrides}, headers=auth)


# ---------- URL normalisation ----------


def test_normalize_url_strips_tracking_and_fragment():
    assert normalize_url("https://WWW.LinkedIn.com/jobs/view/123/?trk=abc&refId=x#top") == (
        "https://www.linkedin.com/jobs/view/123"
    )
    assert normalize_url("https://ca.indeed.com/viewjob?utm_source=mail&jk=abc123") == (
        "https://ca.indeed.com/viewjob?jk=abc123"
    )
    assert normalize_url("  ") is None
    assert normalize_url(None) is None


# ---------- capture ----------


def test_capture_creates_then_dedupes(client, auth):
    first = capture(client, auth)
    assert first.status_code == 201
    body = first.json()
    assert body["created"] is True
    assert body["application"]["status"] == "wishlist"
    assert body["application"]["applied_on"] is None
    assert body["application"]["source"] == "linkedin"

    # Same posting reached via a tracking link: no duplicate
    again = capture(client, auth, url=LI_URL + "?trk=public_jobs")
    assert again.status_code == 200
    assert again.json()["created"] is False and again.json()["changed"] is False
    assert len(client.get("/api/applications", headers=auth).json()) == 1


def test_capture_as_applied_sets_date(client, auth):
    res = capture(client, auth, status="applied", applied_on="2026-11-09")
    assert res.json()["application"]["applied_on"] == "2026-11-09"
    # Server falls back to today when the client sends no date
    res2 = capture(client, auth, url="https://example.com/job/2", status="applied")
    assert res2.json()["application"]["applied_on"] == date.today().isoformat()


def test_capture_moves_wishlist_to_applied(client, auth):
    capture(client, auth)
    res = capture(client, auth, status="applied", applied_on="2026-11-10")
    assert res.json()["changed"] is True
    assert res.json()["application"]["status"] == "applied"
    assert res.json()["application"]["applied_on"] == "2026-11-10"


def test_capture_never_moves_status_backwards(client, auth):
    app_id = capture(client, auth, status="applied").json()["application"]["id"]
    for later in ("interview", "rejected"):
        client.patch(f"/api/applications/{app_id}", json={"status": later}, headers=auth)
        res = capture(client, auth, status="applied")
        assert res.json()["application"]["status"] == later
        assert res.json()["changed"] is False


def test_capture_keeps_user_edits_and_fills_blanks(client, auth):
    app_id = capture(client, auth).json()["application"]["id"]
    client.patch(f"/api/applications/{app_id}", json={"company": "Acme Corp (edited)"}, headers=auth)
    res = capture(client, auth, company="Acme", location="Halifax, NS", remote=True)
    app = res.json()["application"]
    assert app["company"] == "Acme Corp (edited)"
    assert app["location"] == "Halifax, NS"
    assert app["remote"] is True


def test_capture_rejects_other_statuses(client, auth):
    assert capture(client, auth, status="offer").status_code == 422


def test_capture_is_per_user(client, auth):
    capture(client, auth)
    other = register_and_login(client, "b@example.com", "password123")
    res = capture(client, other)
    assert res.status_code == 201  # separate copy for the other user
    assert len(client.get("/api/applications", headers=auth).json()) == 1


# ---------- lookup ----------


def test_lookup(client, auth):
    assert client.get("/api/applications/lookup", params={"url": LI_URL}, headers=auth).status_code == 404
    capture(client, auth)
    found = client.get(
        "/api/applications/lookup", params={"url": LI_URL + "#details"}, headers=auth
    )
    assert found.status_code == 200 and found.json()["company"] == "Acme"
    other = register_and_login(client, "b@example.com", "password123")
    assert client.get("/api/applications/lookup", params={"url": LI_URL}, headers=other).status_code == 404


def test_manual_create_url_is_normalised_so_capture_matches(client, auth):
    client.post(
        "/api/applications",
        json={"company": "Acme", "title": "Dev", "url": LI_URL + "?trk=x"},
        headers=auth,
    )
    assert capture(client, auth).json()["created"] is False


# ---------- schema upgrade ----------


def test_ensure_schema_adds_source_to_old_database(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:  # table as created by version 1.0 (no source column)
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR, password_hash VARCHAR, created_at DATETIME)"))
        conn.execute(text(
            "CREATE TABLE applications (id INTEGER PRIMARY KEY, user_id INTEGER, company VARCHAR, title VARCHAR, "
            "status VARCHAR, location VARCHAR, remote BOOLEAN, url VARCHAR, salary_note VARCHAR, notes TEXT, "
            "applied_on DATE, created_at DATETIME, updated_at DATETIME)"
        ))
    ensure_schema(engine)
    ensure_schema(engine)  # running twice is harmless
    assert "source" in {c["name"] for c in inspect(engine).get_columns("applications")}
    engine.dispose()
