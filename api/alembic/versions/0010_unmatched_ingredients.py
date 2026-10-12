"""Ingredient names the vision model returned that matched nothing, to grow the catalog.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    now = sa.func.now()
    op.create_table(
        "unmatched_ingredient",
        sa.Column("name", sa.String(200), primary_key=True),
        sa.Column("seen", sa.Integer, nullable=False, server_default="1"),
        sa.Column("last_dish", sa.String(200), nullable=False, server_default=""),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )


def downgrade() -> None:
    op.drop_table("unmatched_ingredient")
