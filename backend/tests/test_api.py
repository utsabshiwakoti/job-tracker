from .conftest import register_and_login

JOB = {"company": "Acme", "title": "Junior Developer", "status": "applied", "remote": True}


# ---------- auth ----------


def test_register_login_me(client):
    res = client.post("/api/auth/register", json={"email": "Me@Example.com", "password": "password123"})
    assert res.status_code == 201
    assert res.json()["email"] == "me@example.com"  # normalised to lowercase
    assert "password" not in res.text

    token = client.post(
        "/api/auth/token", data={"username": "me@example.com", "password": "password123"}
    ).json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["email"] == "me@example.com"


def test_duplicate_email_rejected(client):
    body = {"email": "dup@example.com", "password": "password123"}
    assert client.post("/api/auth/register", json=body).status_code == 201
    assert client.post("/api/auth/register", json=body).status_code == 409


def test_weak_password_and_bad_email_rejected(client):
    assert client.post("/api/auth/register", json={"email": "x@example.com", "password": "short"}).status_code == 422
    assert client.post("/api/auth/register", json={"email": "not-an-email", "password": "password123"}).status_code == 422


def test_wrong_password_unauthorized(client):
    client.post("/api/auth/register", json={"email": "a@example.com", "password": "password123"})
    res = client.post("/api/auth/token", data={"username": "a@example.com", "password": "nope-nope"})
    assert res.status_code == 401


def test_endpoints_require_auth(client):
    assert client.get("/api/applications").status_code == 401
    assert client.get("/api/applications", headers={"Authorization": "Bearer garbage"}).status_code == 401


# ---------- CRUD ----------


def test_create_get_update_delete(client, auth):
    created = client.post("/api/applications", json=JOB, headers=auth)
    assert created.status_code == 201
    app_id = created.json()["id"]

    assert client.get(f"/api/applications/{app_id}", headers=auth).json()["company"] == "Acme"

    patched = client.patch(f"/api/applications/{app_id}", json={"status": "interview"}, headers=auth)
    assert patched.status_code == 200
    assert patched.json()["status"] == "interview"
    assert patched.json()["company"] == "Acme"  # untouched fields preserved

    assert client.delete(f"/api/applications/{app_id}", headers=auth).status_code == 204
    assert client.get(f"/api/applications/{app_id}", headers=auth).status_code == 404


def test_patch_can_clear_optional_field_but_not_required(client, auth):
    app_id = client.post(
        "/api/applications", json={**JOB, "notes": "call recruiter"}, headers=auth
    ).json()["id"]
    cleared = client.patch(f"/api/applications/{app_id}", json={"notes": None}, headers=auth)
    assert cleared.status_code == 200 and cleared.json()["notes"] is None
    assert client.patch(f"/api/applications/{app_id}", json={"company": None}, headers=auth).status_code == 422


def test_validation(client, auth):
    assert client.post("/api/applications", json={"company": "", "title": "x"}, headers=auth).status_code == 422
    assert client.post("/api/applications", json={**JOB, "status": "ghosted"}, headers=auth).status_code == 422


def test_users_cannot_see_or_change_each_others_data(client, auth):
    app_id = client.post("/api/applications", json=JOB, headers=auth).json()["id"]
    other = register_and_login(client, "b@example.com", "password123")

    assert client.get("/api/applications", headers=other).json() == []
    assert client.get(f"/api/applications/{app_id}", headers=other).status_code == 404
    assert client.patch(f"/api/applications/{app_id}", json={"status": "offer"}, headers=other).status_code == 404
    assert client.delete(f"/api/applications/{app_id}", headers=other).status_code == 404
    # still intact for the owner
    assert client.get(f"/api/applications/{app_id}", headers=auth).json()["status"] == "applied"


# ---------- filters & stats ----------


def test_filters(client, auth):
    for body in [
        {"company": "Acme", "title": "Backend Dev", "status": "applied", "remote": True},
        {"company": "Globex", "title": "QA Analyst", "status": "wishlist", "remote": False},
        {"company": "Initech", "title": "Support", "status": "applied", "remote": False, "notes": "python shop"},
    ]:
        client.post("/api/applications", json=body, headers=auth)

    def names(**params):
        return sorted(a["company"] for a in client.get("/api/applications", params=params, headers=auth).json())

    assert names(status="applied") == ["Acme", "Initech"]
    assert names(remote="true") == ["Acme"]
    assert names(q="qa") == ["Globex"]  # case-insensitive title match
    assert names(q="python") == ["Initech"]  # matches notes
    assert names(status="applied", remote="false") == ["Initech"]


def test_stats(client, auth):
    empty = client.get("/api/applications/stats", headers=auth).json()
    assert empty["total"] == 0 and empty["response_rate"] == 0.0

    for status in ["wishlist", "applied", "applied", "interview", "offer", "rejected"]:
        client.post("/api/applications", json={**JOB, "status": status}, headers=auth)

    s = client.get("/api/applications/stats", headers=auth).json()
    assert s["total"] == 6
    assert s["by_status"] == {"wishlist": 1, "applied": 2, "interview": 1, "offer": 1, "rejected": 1}
    # submitted = 5 (everything except wishlist); heard back = 3; interviewed = 2
    assert s["response_rate"] == 0.6
    assert s["interview_rate"] == 0.4
