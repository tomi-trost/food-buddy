import pytest

from app.nutrition.macros import Nutrients, total

RICE = Nutrients(kcal=130, protein=2.7, carbs=28, fat=0.3, fiber=0.4, sugar=0)


def test_scaled_by_grams():
    assert RICE.scaled(200).rounded() == {
        "kcal": 260.0,
        "protein": 5.4,
        "carbs": 56.0,
        "fat": 0.6,
        "fiber": 0.8,
        "sugar": 0.0,
    }


def test_zero_grams_is_zero():
    assert RICE.scaled(0) == Nutrients()


def test_negative_grams_rejected():
    with pytest.raises(ValueError):
        RICE.scaled(-1)


def test_total_sums_items_and_empty_is_zero():
    oil = Nutrients(kcal=884, fat=100)
    assert total([RICE.scaled(100), oil.scaled(10)]).rounded()["kcal"] == 218.4
    assert total([]) == Nutrients()
