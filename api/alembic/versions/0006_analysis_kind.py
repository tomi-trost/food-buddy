"""Analysis jobs for snacks: kind meal|snack|label.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-04
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "analysis_job", sa.Column("kind", sa.String(5), nullable=False, server_default="meal")
    )


def downgrade() -> None:
    op.drop_column("analysis_job", "kind")
