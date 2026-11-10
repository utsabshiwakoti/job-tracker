# Job Tracker

A full-stack web app for tracking job applications through a pipeline (Wishlist → Applied → Interview → Offer / Rejected). Built to manage my own job search.

**Stack:** Python · FastAPI · SQLAlchemy · SQLite · JWT auth · React (Vite) · pytest

<!-- Add a screenshot here: ![Board view](docs/board.png) -->

## Features

- Sign up / log in (passwords hashed with scrypt, stateless JWT sessions)
- Kanban board: drag a card between columns, or use the status dropdown on the card
- Add, edit and delete applications (company, title, location, remote flag, posting URL, pay note, notes, date applied)
- Search across company / title / notes, and filter to remote-only
- Summary stats: applications submitted, interviews, response rate, interview rate
- Each user only ever sees their own data (covered by tests)
- Interactive API docs at `/docs`

## Run it locally

You need Python 3.11+ and Node 20+.

```bash
# 1. API (terminal 1)
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
SECRET_KEY=change-me uvicorn app.main:app --reload     # http://localhost:8000/docs

# 2. Front end (terminal 2)
cd frontend
npm install
npm run dev                                            # http://localhost:5173
```

The Vite dev server proxies `/api` to port 8000, so there is nothing else to configure.

Run the tests:

```bash
cd backend && pytest
```

## API

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/token` | Log in (OAuth2 password form), returns a JWT |
| GET | `/api/auth/me` | Current user |
| GET | `/api/applications?status=&q=&remote=` | List/filter your applications |
| POST | `/api/applications` | Create |
| GET / PATCH / DELETE | `/api/applications/{id}` | Read / partially update / delete |
| GET | `/api/applications/stats` | Counts per status and conversion rates |

## Design notes

- **Ownership checks return 404, not 403**, so one user can't probe which IDs exist for another.
- **Login errors are identical** for an unknown email and a wrong password.
- **PATCH uses `exclude_unset`**, so the UI can send just `{status}` when a card is dragged, while an explicit `null` still clears optional fields like notes.
- **Optimistic UI** on drag and drop: the card moves immediately and the board re-syncs with the server afterwards.
- SQLite keeps setup trivial; the `DATABASE_URL` env var lets it point at PostgreSQL without code changes.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | random per start | Signs JWTs. **Set this in production.** |
| `DATABASE_URL` | `sqlite:///./jobtracker.db` | Any SQLAlchemy URL |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins if the front end is hosted separately |

## What I'd add next

- Alembic migrations and PostgreSQL in production
- Follow-up reminders and a calendar view
- Refresh tokens / httpOnly cookie sessions
- Front-end tests (Vitest + Testing Library) and CI with GitHub Actions
