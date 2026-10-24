"""Dish families: pasta with this or that sauce is still pasta.

A meal's family is what we picked in Edit meal (`meal.family`). Otherwise it's guessed:
1. families we made teach themselves: words and main ingredients most of their meals share
   (`learn`), minus what we told it to ignore (`FamilyBlock`);
2. built-in keyword rules on the name, with "Protein & veg plates" read from name + ingredients;
3. the same rules on the three heaviest ingredients.
No model call: it runs on every list."""

import re
from collections import Counter
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.meals.models import FamilyBlock, Meal

OTHER = "Other"
PLATES = "Protein & veg plates"

# fmt: off
# First match wins, so the more specific families come first. Each pattern matches at the start
# of a word; a trailing \b pins short ones ("rice", not "ricotta").
RULES: list[tuple[str, tuple[str, ...]]] = [
    ("Pizza", ("pizza", "calzone")),
    ("Pancakes & waffles", ("pancake", "crepe", "crêpe", "waffle", "palačink")),
    ("Oats & chia", (r"oats?\b", "oatmeal", "porridge", "muesli", "granola", "chia", "overnight")),
    ("Salads", ("salad",)),
    ("Soups & stews", ("soup", "stew", r"chili\b", "goulash", "broth", "minestrone", "ramen",
                       r"pho\b")),
    ("Curries", ("curry", r"dh?al\b", "tikka", "masala", "korma")),
    ("Pasta", ("pasta", "spaghetti", "penne", "fusilli", "linguine", "tagliatelle", "lasagn",
               "ravioli", "tortellini", "macaroni", "carbonara", "bolognese", "noodle")),
    ("Rice & grains", (r"rice\b", "risotto", "arancin", "paella", "quinoa", "couscous", "bulgur",
                       "pilaf", "sushi")),
    ("Veggie plates", ("eggplant", "aubergine")),  # before Eggs
    ("Eggs", (r"eggs?\b", "omelet", "frittata", "shakshuka", "šakšuka", "scrambled")),
    ("Sandwiches & wraps", ("sandwich", "panini", "toast", "wrap", "tortilla", "burrito",
                            r"tacos?\b", "bagel", "burger", "focaccia", "bread", "pita", "kebab")),
    (PLATES, ()),  # name + ingredients, see is_plate
    ("Yogurt & fruit", ("yogurt", "yoghurt", "skyr", "smoothie", "fruit", "apple", r"pears?\b",
                        "banana", "berr", "mango", r"oranges?\b", "grape", "peach", "kiwi",
                        "melon")),
    ("Potatoes", ("potato", "gnocchi", "njok", "fries", r"chips\b", "crisps", "gratin")),
    ("Cakes & sweets", ("cake", "tiramisu", "cookie", "biscuit", "biscotti", "muffin", "brownie",
                        "chocolate", "ice cream", "dessert", "pudding", "croissant")),
    ("Meat & fish", ("chicken", "beef", "pork", "steak", "salmon", r"tuna\b", "fish", "turkey",
                     "sausage", "shrimp", "prawn", r"ham\b", "antipast")),
    ("Veggie plates", ("vegetable", "veggie", "tofu", "tempeh", "lentil", "chickpea", r"beans?\b")),
]

# A protein next to vegetables (potatoes count), on a plate whose heaviest part isn't a starch
PROTEINS = ("chicken", "beef", "pork", "steak", "salmon", r"tuna\b", "fish", "turkey", "sausage",
            "shrimp", "prawn", "lamb", "duck", r"cod\b", "hake", "trout", "tofu", "tempeh",
            "seitan")
VEG = ("vegetable", "veggie", r"veg\b", "zucchin", "courgette", "potato", "broccoli", "carrot",
       "pepper", "paprika", "eggplant", "aubergine", "cauliflower", "spinach", "green bean",
       "asparagus", "mushroom", "squash", "pumpkin", "kale", "cabbage", r"peas?\b", "leek",
       "tomato", "brussels", "beetroot", "fennel")
STARCH = ("pasta", "spaghetti", "noodle", r"rice\b", "bread", "tortilla", r"oats?\b", "couscous",
          "quinoa", "bulgur")
# fmt: on

STOPWORDS = {"with", "and", "the", "for", "con", "alla", "all", "della", "style", "our", "fresh",
             "homemade", "quick", "easy", "baked", "roast", "mixed"}  # fmt: skip


def _any(words: tuple[str, ...], text: str) -> bool:
    return any(re.search(rf"\b(?:{w})", text) for w in words)


def _match(text: str) -> str | None:
    text = text.lower()
    for family, words in RULES:
        if words and _any(words, text):
            return family
    return None


def is_plate(name: str, ingredients_by_weight: list[str]) -> bool:
    everything = " ".join([name, *ingredients_by_weight]).lower()
    main = ingredients_by_weight[0].lower() if ingredients_by_weight else ""
    return _any(PROTEINS, everything) and _any(VEG, everything) and not _any(STARCH, main)


def guess_family(name: str, ingredients_by_weight: list[str]) -> str:
    """The name decides first ("Pasta with pesto"), a protein with vegetables is a plate; else
    the three heaviest ingredients."""
    text = name.lower()
    for family, words in RULES:
        if family == PLATES:
            if is_plate(name, ingredients_by_weight):
                return PLATES
        elif _any(words, text):
            return family
    return next(filter(None, map(_match, ingredients_by_weight[:3])), None) or OTHER


def words_of(name: str) -> set[str]:
    return {w for w in re.findall(r"[^\W\d_]{3,}", name.lower()) if w not in STOPWORDS}


def heaviest(meal: Meal, n: int = 3) -> list:
    return sorted(meal.ingredients, key=lambda mi: -mi.grams)[:n]


@dataclass
class Learned:
    """What the meals we put in a family share: words in at least half their names and main
    ingredients in at least half of them (from 2 meals on)."""

    name: str
    members: int
    words: set[str]
    ingredients: dict[int, str]  # id → name
    blocked_words: set[str] = field(default_factory=set)
    blocked_ingredients: dict[int, str] = field(default_factory=dict)

    def score(self, meal: Meal) -> int:
        """Shared words + main ingredients, once at least two thirds of what it learned (and at
        least 2 things) are there: one word and one vegetable don't make a family."""
        w = len(words_of(meal.name) & self.words)
        i = len({mi.ingredient_id for mi in heaviest(meal)} & set(self.ingredients))
        signals = len(self.words) + len(self.ingredients)
        return w + i if w + i >= max(2, -(-2 * signals // 3)) else 0


def learn(meals: list[Meal], blocks: list[FamilyBlock]) -> list[Learned]:
    picked: dict[str, list[Meal]] = {}
    for m in meals:
        if m.family:
            picked.setdefault(m.family, []).append(m)
    blocked = {b.name: b for b in blocks}
    out = []
    for name, members in picked.items():
        need = max(2, (len(members) + 1) // 2)
        words = Counter(w for m in members for w in words_of(m.name))
        ingredients = Counter(mi.ingredient_id for m in members for mi in heaviest(m))
        names = {mi.ingredient_id: mi.ingredient.name for m in members for mi in heaviest(m)}
        b = blocked.get(name)
        bw = set(b.blocked_words) if b else set()
        bi = set(b.blocked_ingredients) if b else set()
        shared_w = {w for w, c in words.items() if c >= need}
        shared_i = {i for i, c in ingredients.items() if c >= need}
        out.append(
            Learned(
                name=name,
                members=len(members),
                words=shared_w - bw,
                ingredients={i: names[i] for i in shared_i - bi},
                blocked_words=shared_w & bw,
                blocked_ingredients={i: names[i] for i in shared_i & bi},
            )
        )
    return sorted(out, key=lambda f: (-f.members, f.name))


class Families:
    """A household's families: learned ones first, then the built-in rules."""

    def __init__(self, learned: list[Learned]):
        self.learned = learned

    def of(self, meal: Meal) -> str:
        if meal.family:
            return meal.family
        best = max(self.learned, key=lambda f: f.score(meal), default=None)
        if best is not None and best.score(meal) > 0:
            return best.name
        return guess_family(meal.name, [mi.ingredient.name for mi in heaviest(meal, 99)])


async def household_families(session: AsyncSession, household_id: int) -> Families:
    meals = list(
        await session.scalars(
            select(Meal).where(Meal.household_id == household_id, Meal.family.is_not(None))
        )
    )
    blocks = list(
        await session.scalars(select(FamilyBlock).where(FamilyBlock.household_id == household_id))
    )
    return Families(learn(meals, blocks))
