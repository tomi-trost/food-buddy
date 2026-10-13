"""What posting a meal changed, so it can be undone right after.

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-13
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meal", sa.Column("undo", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("meal", "undo")
