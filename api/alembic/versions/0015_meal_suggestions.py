"""Meal suggestions: a meal one of us logged, offered to the other to log too.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    def user_fk(name: str) -> sa.Column:
        fk = sa.ForeignKey("app_user.id", ondelete="CASCADE")
        return sa.Column(name, sa.Integer, fk, nullable=False)

    op.create_table(
        "meal_suggestion",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "household_id",
            sa.Integer,
            sa.ForeignKey("household.id", ondelete="CASCADE"),
            nullable=False,
        ),
        user_fk("from_user_id"),
        user_fk("to_user_id"),
        sa.Column(
            "meal_id", sa.Integer, sa.ForeignKey("meal.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("meal_type", sa.String(10), nullable=False),
        sa.Column("eaten_on", sa.Date, nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("to_user_id", "meal_id", "eaten_on", "meal_type"),
    )


def downgrade() -> None:
    op.drop_table("meal_suggestion")
