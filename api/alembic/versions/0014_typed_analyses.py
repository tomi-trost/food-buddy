"""Analyses from a typed dish name: no photo, the text goes to the model instead.

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("analysis_job", "photo_path", nullable=True)
    op.add_column("analysis_job", sa.Column("description", sa.String(200)))


def downgrade() -> None:
    op.execute("DELETE FROM analysis_job WHERE photo_path IS NULL")
    op.drop_column("analysis_job", "description")
    op.alter_column("analysis_job", "photo_path", nullable=False)
