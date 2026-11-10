import pytest

from app import database
from app.main import app, mount_frontend


@pytest.fixture()
def site(tmp_path, client):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<title>Job Tracker</title>")
    (tmp_path / "assets" / "app-abc123.js").write_text("console.log(1)")
    (tmp_path.parent / "secret.txt").write_text("nope")
    before = len(app.router.routes)
    mount_frontend(app, tmp_path)
    yield client
    del app.router.routes[before:]  # don't leak the catch-all route into other tests


def test_serves_index_and_assets(site):
    home = site.get("/")
    assert home.status_code == 200 and "Job Tracker" in home.text
    assert home.headers["cache-control"] == "no-cache"
    asset = site.get("/assets/app-abc123.js")
    assert asset.text == "console.log(1)"
    assert "immutable" in asset.headers["cache-control"]


def test_unknown_page_falls_back_to_index(site):
    assert "Job Tracker" in site.get("/some/client/route").text


def test_api_routes_still_win(site):
    assert site.get("/api/health").json() == {"status": "ok"}
    assert site.get("/api/does-not-exist").status_code == 404


def test_cannot_escape_static_dir(site):
    assert "nope" not in site.get("/../secret.txt").text
    assert "nope" not in site.get("/%2e%2e/secret.txt").text


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("postgres://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
        ("postgresql://u:p@host/db?sslmode=require", "postgresql+psycopg://u:p@host/db?sslmode=require"),
        ("sqlite:///./x.db", "sqlite:///./x.db"),
    ],
)
def test_database_url_uses_psycopg3(monkeypatch, given, expected):
    monkeypatch.setenv("DATABASE_URL", given)
    assert database._database_url() == expected
