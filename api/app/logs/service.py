from app.logs.models import FoodLog
from app.nutrition.macros import Nutrients

COUNTED = ("piece", "portion")  # values per one; else per 100 g / 100 ml


def snack_nutrients(entry: FoodLog) -> Nutrients:
    """Pieces/portions × values per one, or grams/ml × values per 100 / 100."""
    factor = entry.servings if entry.per in COUNTED else entry.servings / 100
    return Nutrients(**entry.per_unit).scaled(factor * 100)
