"""Saved snacks: the household's own snacks (home-made tiramisu, a favourite bar) to log again.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saved_snack",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "household_id",
            sa.Integer,
            sa.ForeignKey("household.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("app_user.id", ondelete="SET NULL")),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("emoji", sa.String(8), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("per", sa.String(5), nullable=False),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("per_unit", JSONB, nullable=False),
        sa.Column("photo_path", sa.String(255)),
        sa.Column("last_eaten_on", sa.Date),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "saved_snack_name", "saved_snack", ["household_id", sa.text("lower(name)")], unique=True
    )


def downgrade() -> None:
    op.drop_table("saved_snack")
