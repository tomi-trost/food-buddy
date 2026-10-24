"""Dish families: pasta with this or that sauce is still pasta.

A meal's family is what we picked in Edit meal (`meal.family`), else a guess from its name and
then its main ingredients (heaviest first), by keyword. No model call: it runs on every list."""

import re

from app.meals.models import Meal

OTHER = "Other"

# First match wins, so the more specific families come first. Each pattern matches at the start
# of a word; a trailing \b pins short ones ("rice", not "ricotta").
RULES: list[tuple[str, tuple[str, ...]]] = [
    ("Pizza", ("pizza", "calzone")),
    ("Pancakes & waffles", ("pancake", "crepe", "crêpe", "waffle", "palačink")),
    ("Oats & chia", (r"oats?\b", "oatmeal", "porridge", "muesli", "granola", "chia", "overnight")),
    ("Salads", ("salad",)),
    (
        "Soups & stews",
        ("soup", "stew", r"chili\b", "goulash", "broth", "minestrone", "ramen", r"pho\b"),
    ),
    ("Curries", ("curry", r"dh?al\b", "tikka", "masala", "korma")),
    (
        "Pasta",
        (
            "pasta",
            "spaghetti",
            "penne",
            "fusilli",
            "linguine",
            "tagliatelle",
            "lasagn",
            "gnocchi",
            "ravioli",
            "tortellini",
            "macaroni",
            "carbonara",
            "bolognese",
            "noodle",
        ),
    ),
    (
        "Rice & grains",
        (
            r"rice\b",
            "risotto",
            "arancin",
            "paella",
            "quinoa",
            "couscous",
            "bulgur",
            "pilaf",
            "sushi",
        ),
    ),
    ("Veggie plates", ("eggplant", "aubergine")),  # before Eggs
    ("Eggs", (r"eggs?\b", "omelet", "frittata", "shakshuka", "šakšuka", "scrambled")),
    (
        "Sandwiches & wraps",
        (
            "sandwich",
            "panini",
            "toast",
            "wrap",
            "tortilla",
            "burrito",
            r"tacos?\b",
            "bagel",
            "burger",
            "focaccia",
            "bread",
            "pita",
            "kebab",
        ),
    ),
    (
        "Yogurt & fruit",
        (
            "yogurt",
            "yoghurt",
            "skyr",
            "smoothie",
            "fruit",
            "apple",
            r"pears?\b",
            "banana",
            "berr",
            "mango",
            r"oranges?\b",
            "grape",
            "peach",
            "kiwi",
            "melon",
        ),
    ),
    ("Potatoes", ("potato", "fries", r"chips\b", "crisps", "gratin")),
    (
        "Cakes & sweets",
        (
            "cake",
            "tiramisu",
            "cookie",
            "biscuit",
            "biscotti",
            "muffin",
            "brownie",
            "chocolate",
            "ice cream",
            "dessert",
            "pudding",
            "croissant",
        ),
    ),
    (
        "Meat & fish",
        (
            "chicken",
            "beef",
            "pork",
            "steak",
            "salmon",
            r"tuna\b",
            "fish",
            "turkey",
            "sausage",
            "shrimp",
            "prawn",
            "ham\b",
            "antipast",
        ),
    ),
    ("Veggie plates", ("vegetable", "veggie", "tofu", "tempeh", "lentil", "chickpea", r"beans?\b")),
]


def _match(text: str) -> str | None:
    text = text.lower()
    for family, words in RULES:
        if any(re.search(rf"\b(?:{w})", text) for w in words):
            return family
    return None


def guess_family(name: str, ingredients_by_weight: list[str]) -> str:
    """The name decides first ("Pasta with pesto"); else the three heaviest ingredients."""
    return _match(name) or next(filter(None, map(_match, ingredients_by_weight[:3])), None) or OTHER


def family_of(meal: Meal) -> str:
    if meal.family:
        return meal.family
    heavy = sorted(meal.ingredients, key=lambda mi: -mi.grams)
    return guess_family(meal.name, [mi.ingredient.name for mi in heavy])
