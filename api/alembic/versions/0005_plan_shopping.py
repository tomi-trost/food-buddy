"""Weekly plan (slots, approvals) and shopping-list check marks.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-04
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_week",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "household_id",
            sa.Integer,
            sa.ForeignKey("household.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("week_start", sa.Date, nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="draft"),
        sa.Column("wizard", postgresql.JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "plan_slot",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "plan_id", sa.Integer, sa.ForeignKey("plan_week.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("day", sa.SmallInteger, nullable=False),
        sa.Column("meal_type", sa.String(10), nullable=False),
        sa.Column("mode", sa.String(5), nullable=False),
        sa.Column("minutes", sa.SmallInteger),
        sa.Column("meal_id", sa.Integer, sa.ForeignKey("meal.id", ondelete="SET NULL")),
        sa.UniqueConstraint("plan_id", "day", "meal_type"),
        sa.CheckConstraint("day BETWEEN 0 AND 6"),
        sa.CheckConstraint("mode IN ('cook', 'prep', 'out', 'skip')"),
    )
    op.create_table(
        "plan_approval",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "plan_id", sa.Integer, sa.ForeignKey("plan_week.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "user_id", sa.Integer, sa.ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
        ),
        sa.UniqueConstraint("plan_id", "user_id"),
    )
    op.create_table(
        "shopping_check",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "household_id",
            sa.Integer,
            sa.ForeignKey("household.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "ingredient_id",
            sa.Integer,
            sa.ForeignKey("ingredient.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("household_id", "ingredient_id"),
    )


def downgrade() -> None:
    for table in ("shopping_check", "plan_approval", "plan_slot", "plan_week"):
        op.drop_table(table)
