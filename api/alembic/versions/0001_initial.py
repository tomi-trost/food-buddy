"""Initial schema: household, users, ingredients, analysis jobs, Procrastinate queue.

Revision ID: 0001
Revises:
Create Date: 2026-10-04
"""

import sqlalchemy as sa
from alembic import op
from procrastinate.schema import SchemaManager
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "household",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("invite_code", sa.String(32), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "app_user",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "household_id",
            sa.Integer,
            sa.ForeignKey("household.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "ingredient",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("aliases", postgresql.ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("kcal", sa.Float, nullable=False),
        sa.Column("protein", sa.Float, nullable=False),
        sa.Column("carbs", sa.Float, nullable=False),
        sa.Column("fat", sa.Float, nullable=False),
        sa.Column("fiber", sa.Float, nullable=False, server_default="0"),
        sa.Column("sugar", sa.Float, nullable=False, server_default="0"),
        sa.UniqueConstraint("source", "name"),
    )
    op.execute(
        "CREATE INDEX ix_ingredient_name_trgm ON ingredient USING gin (lower(name) gin_trgm_ops)"
    )
    op.execute("CREATE INDEX ix_ingredient_aliases ON ingredient USING gin (aliases)")
    op.create_table(
        "analysis_job",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "household_id",
            sa.Integer,
            sa.ForeignKey("household.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("app_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("photo_path", sa.String(255), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="queued"),
        sa.Column("provider", sa.String(40)),
        sa.Column("raw", postgresql.JSONB),
        sa.Column("result", postgresql.JSONB),
        sa.Column("error", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_analysis_job_household", "analysis_job", ["household_id", "created_at"])

    # Procrastinate's queue tables/functions. Later Procrastinate upgrades ship SQL migrations
    # (SchemaManager.get_migrations_path()) that we copy into new Alembic revisions.
    op.execute(SchemaManager.get_schema())


def downgrade() -> None:
    op.drop_table("analysis_job")
    op.drop_table("ingredient")
    op.drop_table("app_user")
    op.drop_table("household")
    # Procrastinate objects are left in place; drop the database to remove them.
