"""Bundles: a plate can hold portions of another meal of ours (a component with its own recipe).

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meal_component",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "meal_id", sa.Integer, sa.ForeignKey("meal.id", ondelete="CASCADE"), nullable=False
        ),
        # Deleting a component first moves its ingredients into the plates (meals.service)
        sa.Column(
            "component_id",
            sa.Integer,
            sa.ForeignKey("meal.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column("portions", sa.Float, nullable=False),
        sa.UniqueConstraint("meal_id", "component_id"),
        sa.CheckConstraint("portions > 0 AND meal_id <> component_id"),
    )


def downgrade() -> None:
    op.drop_table("meal_component")
