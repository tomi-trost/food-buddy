"""Imports every model so Base.metadata is complete (Alembic, tests)."""

from app.analysis.models import AnalysisJob
from app.auth.models import Household, User
from app.db import Base
from app.nutrition.models import Ingredient

__all__ = ["AnalysisJob", "Base", "Household", "Ingredient", "User"]
