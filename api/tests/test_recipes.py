import httpx

from app.config import VisionProviderConfig
from app.meals.models import Meal, MealIngredient
from app.meals.recipes import template_steps
from app.meals.tasks import improve_recipe
from app.vision.providers import OpenAICompatibleProvider, VisionChain
from tests.conftest import ingredient_ids, register
from tests.fakes import vision_transport


def test_template_matches_mock_wording():
    steps = template_steps(["Chickpeas", "Rice (cooked)", "Tomatoes", "Spinach", "Onions"], 30, 4)
    assert steps == [
        "Prep: wash and chop chickpeas, rice (cooked), tomatoes.",
        "Heat a pan with oil; cook chickpeas until golden (~9 min).",
        "Add rice (cooked), tomatoes, spinach and simmer/stir for 12 min.",
        "Season, taste, adjust and serve in 4 portions.",
    ]


def test_template_rounds_half_up_and_handles_one_or_no_ingredient():
    # 25 × 0.3 = 7.5 → 8 (Python's round() would give 8 too, 0.5 cases like 2.5 → 3 not 2)
    assert "~8 min" in template_steps(["Eggs"], 25, 1)[1]
    assert "(~3 min)" in template_steps(["Eggs"], 9, 1)[1]  # 2.7 → 3
    assert len(template_steps(["Eggs"], 10, 1)) == 3  # no "Add …" step
    assert template_steps([], 10, 2) == ["Serve in 2 portions."]


async def make_meal(session, client):
    await register(client)
    chicken, rice = await ingredient_ids(session, "Chicken breast", "Rice (cooked)")
    meal = Meal(
        household_id=1,
        name="Bowl",
        types=["lunch"],
        prep_minutes=20,
        portions=2,
        steps=["template"],
        ingredients=[
            MealIngredient(ingredient_id=chicken, grams=300),
            MealIngredient(ingredient_id=rice, grams=400),
        ],
    )
    session.add(meal)
    await session.commit()
    return meal.id


def chain(transport):
    config = VisionProviderConfig(name="t", url="http://vision.test/v1", model="m")
    return VisionChain([OpenAICompatibleProvider(config, httpx.AsyncClient(transport=transport))])


async def test_model_recipe_replaces_template(client, seeded):
    meal_id = await make_meal(seeded, client)
    seen: list = []
    answer = {"steps": ["Cook the rice.", "  Grill the chicken.  ", "Serve."]}
    assert await improve_recipe(seeded, meal_id, chain(vision_transport(answer, seen=seen)))

    meal = await seeded.get(Meal, meal_id)
    await seeded.refresh(meal)
    assert meal.steps == ["Cook the rice.", "Grill the chicken.", "Serve."]
    assert meal.steps_source == "model"
    prompt = seen[0].content.decode()
    assert "Rice (cooked): 400 g" in prompt and "Portions: 2" in prompt


async def test_model_failure_keeps_template_and_model_runs_once(client, seeded):
    meal_id = await make_meal(seeded, client)
    assert not await improve_recipe(seeded, meal_id, chain(vision_transport(status=500)))
    meal = await seeded.get(Meal, meal_id)
    assert meal.steps == ["template"]

    meal.steps_source = "model"  # e.g. already improved
    await seeded.commit()
    seen: list = []
    assert not await improve_recipe(seeded, meal_id, chain(vision_transport(seen=seen)))
    assert seen == []
