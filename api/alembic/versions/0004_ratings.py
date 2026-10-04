"""Ratings: taste (half stars), make again, worth the effort, how filling — per person per meal.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-04
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rating",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "meal_id", sa.Integer, sa.ForeignKey("meal.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "user_id", sa.Integer, sa.ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("taste", sa.Numeric(2, 1), nullable=False),
        sa.Column("again", sa.SmallInteger, nullable=False),
        sa.Column("effort", sa.SmallInteger, nullable=False),
        sa.Column("fill", sa.String(10), nullable=False, server_default="right"),
        sa.Column("note", sa.Text),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("meal_id", "user_id"),
        sa.CheckConstraint("taste >= 0.5 AND taste <= 5 AND taste * 2 = floor(taste * 2)"),
        sa.CheckConstraint("again IN (1, 3, 5) AND effort IN (1, 3, 5)"),
        sa.CheckConstraint("fill IN ('hungry', 'right', 'heavy')"),
    )


def downgrade() -> None:
    op.drop_table("rating")
