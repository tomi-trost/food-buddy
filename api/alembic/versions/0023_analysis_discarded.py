"""Discarded photos are marked, so a discard can be undone (not a posted or logged one).

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "analysis_job",
        sa.Column("discarded", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("analysis_job", "discarded")
