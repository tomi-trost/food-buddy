"""Procrastinate app (Postgres-backed queue).

Worker: procrastinate --app=app.jobs.jobs_app worker
"""

from procrastinate import App, PsycopgConnector

import app.models  # noqa: F401  (the worker never imports app.main; register every ORM table)
from app.config import get_settings

jobs_app = App(
    connector=PsycopgConnector(conninfo=get_settings().psycopg_conninfo),
    import_paths=["app.analysis.tasks"],
)
