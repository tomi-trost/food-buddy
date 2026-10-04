# 0015 — FastAPI backend
Date: 2026-10-04 · Status: accepted

**Context:** The mock needs a real backend for two users: meals, ratings, plan, inventory and the AI analysis jobs.
**Decision:** The API is written in Python with **FastAPI** (Pydantic v2, SQLAlchemy 2 + Alembic, PostgreSQL). Slow AI work runs in a separate worker (Procrastinate, a Postgres-backed queue). The client's TypeScript types are generated from FastAPI's OpenAPI schema. See `docs/design-plan.md` §3.
**Alternatives:** Node/NestJS or a BaaS such as Supabase or PocketBase (rejected: FastAPI is the stack Tomi knows best, and the AI pipeline is Python anyway).
**Consequences:** One language for the API and the AI pipeline. API and worker ship as one Docker image with two commands.
