"""Imports every model so Base.metadata is complete (Alembic, tests, worker)."""

from app.analysis.models import AnalysisJob
from app.auth.models import Household, User
from app.db import Base
from app.inventory.models import InventoryItem, RanOut
from app.logs.models import FoodLog
from app.meals.models import CookLog, Meal, MealIngredient
from app.nutrition.models import Ingredient

__all__ = [
    "AnalysisJob",
    "Base",
    "CookLog",
    "FoodLog",
    "Household",
    "Ingredient",
    "InventoryItem",
    "Meal",
    "MealIngredient",
    "RanOut",
    "User",
]
