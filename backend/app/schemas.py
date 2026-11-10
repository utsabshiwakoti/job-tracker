from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .models import Status


class UserCreate(BaseModel):
    # Plain str keeps the dependency list small; the unique index + a simple check is enough here.
    email: str = Field(min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ApplicationBase(BaseModel):
    company: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    status: Status = Status.wishlist
    location: str | None = Field(default=None, max_length=200)
    remote: bool = False
    url: str | None = Field(default=None, max_length=500)
    salary_note: str | None = Field(default=None, max_length=100)
    notes: str | None = None
    applied_on: date | None = None
    source: str | None = Field(default=None, max_length=50)


class ApplicationCreate(ApplicationBase):
    pass


class ApplicationCapture(BaseModel):
    """Sent by the browser extension. Upserts by URL, so it is safe to send more than once."""

    url: str = Field(min_length=1, max_length=500)
    company: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    status: Literal["wishlist", "applied"] = "wishlist"
    location: str | None = Field(default=None, max_length=200)
    remote: bool | None = None
    source: str | None = Field(default=None, max_length=50)
    applied_on: date | None = None  # the client's local date; server uses today if missing


class CaptureResult(BaseModel):
    application: "ApplicationOut"
    created: bool
    changed: bool


class ApplicationUpdate(BaseModel):
    """All fields optional so the client can PATCH just what changed (e.g. drag to a new status)."""

    company: str | None = Field(default=None, min_length=1, max_length=200)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: Status | None = None
    location: str | None = Field(default=None, max_length=200)
    remote: bool | None = None
    url: str | None = Field(default=None, max_length=500)
    salary_note: str | None = Field(default=None, max_length=100)
    notes: str | None = None
    applied_on: date | None = None
    source: str | None = Field(default=None, max_length=50)


class ApplicationOut(ApplicationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class Stats(BaseModel):
    total: int
    by_status: dict[str, int]
    response_rate: float  # share of submitted applications that reached interview/offer/rejected
    interview_rate: float  # share of submitted applications that reached interview/offer


CaptureResult.model_rebuild()  # resolve the forward reference to ApplicationOut
