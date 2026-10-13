"""Products we scanned, as we last logged them.

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-13
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "household_product",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "household_id",
            sa.Integer,
            sa.ForeignKey("household.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(14), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("per100", JSONB, nullable=False),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("updated_by", sa.Integer, sa.ForeignKey("app_user.id", ondelete="SET NULL")),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("household_id", "code"),
    )


def downgrade() -> None:
    op.drop_table("household_product")
