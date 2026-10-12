from app.logs.models import FoodLog
from app.nutrition.macros import Nutrients


def snack_nutrients(entry: FoodLog) -> Nutrients:
    """Pieces × values per piece, or grams × values per 100 g / 100."""
    factor = entry.servings if entry.per == "piece" else entry.servings / 100
    return Nutrients(**entry.per_unit).scaled(factor * 100)
