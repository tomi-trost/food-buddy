"""Profile goals + colour, household reward settings, ingredient emoji/category/price/shelf life.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-04
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ingredient", sa.Column("emoji", sa.String(8), nullable=False, server_default=""))
    op.add_column(
        "ingredient", sa.Column("category", sa.String(20), nullable=False, server_default="Pantry")
    )
    op.add_column(
        "ingredient", sa.Column("price_per_100g", sa.Float, nullable=False, server_default="0")
    )
    op.add_column(
        "ingredient", sa.Column("shelf_days", sa.Integer, nullable=False, server_default="7")
    )

    for name, default in (
        ("goal_kcal", "2200"),
        ("goal_protein", "110"),
        ("goal_fiber", "30"),
        ("goal_sugar", "50"),
    ):
        op.add_column(
            "app_user", sa.Column(name, sa.Integer, nullable=False, server_default=default)
        )
    op.add_column(
        "app_user", sa.Column("color", sa.String(9), nullable=False, server_default="#b9532f")
    )

    op.add_column(
        "household", sa.Column("reward_per", sa.Integer, nullable=False, server_default="2")
    )
    op.add_column(
        "household", sa.Column("reward_cap", sa.Integer, nullable=False, server_default="3")
    )


def downgrade() -> None:
    for column in ("reward_cap", "reward_per"):
        op.drop_column("household", column)
    for column in ("color", "goal_sugar", "goal_fiber", "goal_protein", "goal_kcal"):
        op.drop_column("app_user", column)
    for column in ("shelf_days", "price_per_100g", "category", "emoji"):
        op.drop_column("ingredient", column)
