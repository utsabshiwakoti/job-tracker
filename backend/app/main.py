import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from . import models, schemas
from .database import Base, engine, get_db
from .models import Application, Status, User
from .security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)  # fine for a small app; use Alembic migrations if it grows
    yield


app = FastAPI(title="Job Tracker API", version="1.0.0", lifespan=lifespan)

# The Vite dev server proxies /api, so CORS only matters if the front end is hosted elsewhere.
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------- auth ----------


@app.post("/api/auth/register", response_model=schemas.UserOut, status_code=201)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    return user


@app.post("/api/auth/token", response_model=schemas.Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """OAuth2 password flow (form fields `username` = email, `password`). Works with the docs' Authorize button."""
    user = db.scalar(select(User).where(User.email == form.username.lower()))
    # Same error for unknown email and wrong password so the API doesn't reveal which emails exist.
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return schemas.Token(access_token=create_access_token(user.id))


@app.get("/api/auth/me", response_model=schemas.UserOut)
def me(user: User = Depends(get_current_user)):
    return user


# ---------- applications ----------


def _get_owned(db: Session, app_id: int, user: User) -> Application:
    """Fetch an application only if it belongs to the user; 404 (not 403) so IDs can't be probed."""
    obj = db.scalar(
        select(Application).where(Application.id == app_id, Application.user_id == user.id)
    )
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    return obj


@app.get("/api/applications", response_model=list[schemas.ApplicationOut])
def list_applications(
    status_filter: Status | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=100, description="Search company/title/notes"),
    remote: bool | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Application).where(Application.user_id == user.id)
    if status_filter:
        stmt = stmt.where(Application.status == status_filter)
    if remote is not None:
        stmt = stmt.where(Application.remote == remote)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Application.company.ilike(like),
                Application.title.ilike(like),
                Application.notes.ilike(like),
            )
        )
    stmt = stmt.order_by(Application.updated_at.desc(), Application.id.desc())
    return db.scalars(stmt).all()


@app.get("/api/applications/stats", response_model=schemas.Stats)
def stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(
        select(Application.status, func.count())
        .where(Application.user_id == user.id)
        .group_by(Application.status)
    ).all()
    by_status = {s.value: 0 for s in Status}
    for st, count in rows:
        by_status[st.value] = count

    submitted = sum(by_status[s] for s in ("applied", "interview", "offer", "rejected"))
    heard_back = sum(by_status[s] for s in ("interview", "offer", "rejected"))
    interviewed = sum(by_status[s] for s in ("interview", "offer"))
    return schemas.Stats(
        total=sum(by_status.values()),
        by_status=by_status,
        response_rate=round(heard_back / submitted, 3) if submitted else 0.0,
        interview_rate=round(interviewed / submitted, 3) if submitted else 0.0,
    )


@app.post("/api/applications", response_model=schemas.ApplicationOut, status_code=201)
def create_application(
    payload: schemas.ApplicationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    obj = Application(**payload.model_dump(), user_id=user.id)
    db.add(obj)
    db.commit()
    return obj


@app.get("/api/applications/{app_id}", response_model=schemas.ApplicationOut)
def get_application(
    app_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    return _get_owned(db, app_id, user)


@app.patch("/api/applications/{app_id}", response_model=schemas.ApplicationOut)
def update_application(
    app_id: int,
    payload: schemas.ApplicationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    obj = _get_owned(db, app_id, user)
    # exclude_unset: only fields the client actually sent, so null can still clear a field.
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is None and field in {"company", "title", "status", "remote"}:
            raise HTTPException(422, f"{field} cannot be null")
        setattr(obj, field, value)
    db.commit()
    return obj


@app.delete("/api/applications/{app_id}", status_code=204)
def delete_application(
    app_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    db.delete(_get_owned(db, app_id, user))
    db.commit()
    return Response(status_code=204)
