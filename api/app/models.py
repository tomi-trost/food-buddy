"""Imports every model so Base.metadata is complete (Alembic, tests, worker)."""

from app.analysis.models import AnalysisJob, AnalysisRating
from app.auth.models import Household, User
from app.barcode.models import HouseholdProduct, OffProduct
from app.db import Base
from app.inventory.models import InventoryItem, RanOut
from app.logs.models import FoodLog
from app.meals.models import CookLog, Meal, MealIngredient
from app.nutrition.models import Ingredient, UnmatchedIngredient
from app.plan.models import PlanApproval, PlanSlot, PlanWeek, ShoppingCheck
from app.push.models import PushSent, PushSubscription
from app.ratings.models import Rating
from app.suggestions.models import MealSuggestion

__all__ = [
    "AnalysisJob",
    "AnalysisRating",
    "Base",
    "CookLog",
    "FoodLog",
    "Household",
    "HouseholdProduct",
    "Ingredient",
    "UnmatchedIngredient",
    "InventoryItem",
    "Meal",
    "MealIngredient",
    "MealSuggestion",
    "OffProduct",
    "PlanApproval",
    "PlanSlot",
    "PlanWeek",
    "PushSent",
    "PushSubscription",
    "RanOut",
    "Rating",
    "ShoppingCheck",
    "User",
]
