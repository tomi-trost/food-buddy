"""Photo remembers the meal type and whether it's only saved for later (not eaten).

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("analysis_job", sa.Column("meal_type", sa.String(10)))
    op.add_column(
        "analysis_job",
        sa.Column("save_only", sa.Boolean, nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("analysis_job", "save_only")
    op.drop_column("analysis_job", "meal_type")
