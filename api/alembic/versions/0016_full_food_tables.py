"""Full USDA SR Legacy + Ciqual import: rows outside the hand-picked catalog.

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-13
"""

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # curated: mock, hand-picked catalog and custom rows; false = bulk import (exact matches only)
    op.add_column(
        "ingredient",
        sa.Column("curated", sa.Boolean, nullable=False, server_default=sa.true()),
    )
    # USDA fdc_id / Ciqual code of the source row ('' for mock and custom)
    op.add_column("ingredient", sa.Column("ref", sa.String(20), nullable=False, server_default=""))


def downgrade() -> None:
    # Bulk rows in use stay (as plain rows); the rest would fuzzy-match without the flag.
    op.execute(
        """
        DELETE FROM ingredient WHERE NOT curated AND id NOT IN (
            SELECT ingredient_id FROM meal_ingredient UNION SELECT ingredient_id FROM inventory_item
            UNION SELECT ingredient_id FROM ran_out
        )
        """
    )
    op.drop_column("ingredient", "ref")
    op.drop_column("ingredient", "curated")
