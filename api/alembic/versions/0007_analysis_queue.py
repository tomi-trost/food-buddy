"""Background analysis: jobs stay open until posted/logged/discarded; early ratings.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("analysis_job", sa.Column("closed_at", sa.DateTime(timezone=True)))
    # Jobs from before the queue existed shouldn't all pop up as "ready to check"
    op.execute("UPDATE analysis_job SET closed_at = coalesce(finished_at, created_at)")
    op.create_table(
        "analysis_rating",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "job_id",
            sa.Integer,
            sa.ForeignKey("analysis_job.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.Integer, sa.ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("taste", sa.Numeric(2, 1), nullable=False),
        sa.Column("again", sa.SmallInteger, nullable=False),
        sa.Column("effort", sa.SmallInteger, nullable=False),
        sa.Column("fill", sa.String(10), nullable=False, server_default="right"),
        sa.Column("note", sa.Text),
        sa.UniqueConstraint("job_id", "user_id"),
    )


def downgrade() -> None:
    op.drop_table("analysis_rating")
    op.drop_column("analysis_job", "closed_at")
