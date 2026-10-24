"""What a learned dish family should stop matching on (words, ingredients).

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "family_block",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "household_id",
            sa.Integer,
            sa.ForeignKey("household.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("blocked_words", sa.ARRAY(sa.String(40)), nullable=False, server_default="{}"),
        sa.Column("blocked_ingredients", sa.ARRAY(sa.Integer), nullable=False, server_default="{}"),
        sa.UniqueConstraint("household_id", "name"),
    )


def downgrade() -> None:
    op.drop_table("family_block")
