"""Worth the effort and how filling become 7-step sliders (−3…+3, 0 = meh / just right).

Effort 1/3/5 → −3/0/+3, fill hungry/right/heavy → −2/0/+2. Snacks (meals typed only
"snack") aren't cooked: their effort and fill are cleared and stay empty.

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-24
"""

from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None

TABLES = ("rating", "analysis_rating")


def drop_checks(table: str) -> None:
    """The 0004 checks were unnamed: drop whatever check mentions effort or fill."""
    op.execute(f"""
        DO $$ DECLARE c record; BEGIN
          FOR c IN SELECT conname FROM pg_constraint
                   WHERE conrelid = '{table}'::regclass AND contype = 'c'
                     AND (pg_get_constraintdef(oid) LIKE '%effort%'
                          OR pg_get_constraintdef(oid) LIKE '%fill%')
          LOOP EXECUTE format('ALTER TABLE {table} DROP CONSTRAINT %I', c.conname); END LOOP;
        END $$
    """)


def upgrade() -> None:
    for table in TABLES:
        drop_checks(table)
        op.execute(f"ALTER TABLE {table} ALTER COLUMN effort DROP NOT NULL")
        op.execute(
            f"UPDATE {table} SET effort = CASE effort WHEN 5 THEN 3 WHEN 3 THEN 0 ELSE -3 END"
        )
        op.execute(f"ALTER TABLE {table} ALTER COLUMN fill DROP DEFAULT")
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN fill TYPE smallint USING "
            "CASE fill WHEN 'hungry' THEN -2 WHEN 'heavy' THEN 2 ELSE 0 END"
        )
        op.execute(f"ALTER TABLE {table} ALTER COLUMN fill DROP NOT NULL")
        op.create_check_constraint(
            f"{table}_sliders", table, "effort BETWEEN -3 AND 3 AND fill BETWEEN -3 AND 3"
        )
    op.execute(
        "UPDATE rating SET effort = NULL, fill = NULL FROM meal "
        "WHERE meal.id = rating.meal_id AND meal.types = ARRAY['snack']::varchar[]"
    )
    op.execute(
        "UPDATE analysis_rating SET effort = NULL, fill = NULL FROM analysis_job "
        "WHERE analysis_job.id = analysis_rating.job_id AND analysis_job.meal_type = 'snack'"
    )


def downgrade() -> None:
    for table in TABLES:
        op.drop_constraint(f"{table}_sliders", table)
        op.execute(
            f"UPDATE {table} SET effort = CASE WHEN effort IS NULL THEN 3 "
            "WHEN effort > 0 THEN 5 WHEN effort < 0 THEN 1 ELSE 3 END"
        )
        op.execute(f"ALTER TABLE {table} ALTER COLUMN effort SET NOT NULL")
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN fill TYPE varchar(10) USING "
            "CASE WHEN fill < 0 THEN 'hungry' WHEN fill > 0 THEN 'heavy' ELSE 'right' END"
        )
        op.execute(f"ALTER TABLE {table} ALTER COLUMN fill SET NOT NULL")
        op.execute(f"ALTER TABLE {table} ALTER COLUMN fill SET DEFAULT 'right'")
        op.create_check_constraint(
            f"{table}_effort_fill",
            table,
            "effort IN (1, 3, 5) AND fill IN ('hungry', 'right', 'heavy')",
        )
