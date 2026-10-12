import argparse
import base64
import json

import httpx
import pytest
from sqlalchemy import func, select

from app.meals.models import Meal, MealIngredient
from app.nutrition.models import Ingredient, UnmatchedIngredient
from app.vision.schemas import MealAnalysis
from benchmark import dataset, household, nutrition5k, report
from benchmark.household_dump import meal_sample
from benchmark.metrics import Keyed, ingredient_scores, pct_error, summarize
from benchmark.run import parse_args, run_model, score
from tests.conftest import jpeg_bytes
from tests.fakes import PLATE, chat_response

N5K_ROW = (
    "dish_1,300.5,193.0,12.4,28.2,18.6,"
    "ingr_1,white rice,150.0,195.0,0.4,42.0,4.0,"
    "ingr_2,parsley,0.2,0.1,0.0,0.0,0.0,"
    ",,,,,,"
).split(",")


def sample(id="s1", items=(("chicken breast", 150), ("white rice", 200)), kcal=600, **extra):
    totals = {"kcal": kcal, "protein": 50, "carbs": 60, "fat": 10}
    return dataset.Sample(
        id=id,
        image=f"{id}.jpg",
        source=extra.pop("source", "nutrition5k"),
        items=[dataset.TruthItem(n, g) for n, g in items],
        totals=totals,
        **extra,
    )


# --- dataset ---------------------------------------------------------------------------


def test_parses_nutrition5k_row_and_skips_empty_ingredient_columns():
    s = dataset.parse_nutrition5k_row(N5K_ROW)
    assert s.id == "dish_1" and s.image == "dish_1.jpg" and s.source == "nutrition5k"
    assert [(i.name, i.grams) for i in s.items] == [("white rice", 150.0), ("parsley", 0.2)]
    assert s.totals == {"kcal": 300.5, "protein": 18.6, "carbs": 28.2, "fat": 12.4}


def test_manifest_round_trip(tmp_path):
    samples = [sample("a"), sample("b", items=(), kcal=0, dish="Toast", notes={"x": 1})]
    dataset.save(tmp_path, samples)
    assert dataset.load(tmp_path) == samples


# --- metrics ---------------------------------------------------------------------------


def test_scores_ignore_tiny_truth_items_for_recall_but_accept_them_as_named():
    truth = [Keyed("rice", 200), Keyed("chicken", 100), Keyed("parsley", 1)]
    predicted = [Keyed("rice", 180), Keyed("parsley", 3), Keyed("butter", 10)]
    scores = ingredient_scores(predicted, truth)
    assert scores["precision"] == pytest.approx(2 / 3)  # butter wasn't there
    assert scores["recall"] == pytest.approx(1 / 2)  # chicken missed, parsley doesn't count
    assert scores["mass_recall"] == pytest.approx(200 / 300)


def test_scores_with_nothing_named_or_nothing_significant():
    assert ingredient_scores([], [Keyed("rice", 100)]) == {
        "precision": None,
        "recall": 0.0,
        "mass_recall": 0.0,
    }
    only_tiny = ingredient_scores([Keyed("salt", 1)], [Keyed("salt", 1)])
    assert only_tiny == {"precision": 1.0, "recall": None, "mass_recall": None}


def test_pct_error_is_signed_and_skips_near_zero_truth():
    assert pct_error(150, 100) == 50
    assert pct_error(50, 100) == -50
    assert pct_error(10, 0) is None
    assert pct_error(10, 0.5) is None


def test_summary_counts_invalid_answers_and_uses_medians():
    rows = [
        {"ok": True, "kcal_err_pct": -40, "latency_s": 10, "precision": 1.0},
        {"ok": True, "kcal_err_pct": 10, "latency_s": 20, "precision": 0.5},
        {"ok": True, "kcal_err_pct": 20, "latency_s": 30, "precision": None},
        {"ok": False, "latency_s": 100},
    ]
    s = summarize(rows)
    assert s["n"] == 4 and s["valid_pct"] == 75
    assert s["kcal_abs_pct"] == 20 and s["kcal_bias_pct"] == 10
    assert s["precision"] == 0.75
    assert s["latency_s"] == 25 and s["latency_p90_s"] == 100
    assert s["fat_abs_pct"] is None
    assert summarize([])["valid_pct"] is None


# --- scoring against the catalog -------------------------------------------------------


async def test_score_grounds_both_sides_through_the_catalog_and_writes_nothing(seeded):
    truth = sample(items=(("chicken breast", 150), ("cooked rice", 200), ("broccoli", 80)))
    row = await score(seeded, truth, MealAnalysis.model_validate(PLATE))

    # "grilled chicken breast" and "cooked rice" match; olive oil wasn't there; sauce unknown
    assert row["recall"] == pytest.approx(2 / 3)
    assert row["precision"] == pytest.approx(2 / 4)
    assert row["unmatched"] == 1
    assert row["mass_pred"] == 390 and row["mass_err_pct"] == pytest.approx((390 - 430) / 4.3)
    assert row["kcal_pred"] > 0 and row["kcal_err_pct"] == pytest.approx(
        (row["kcal_pred"] - 600) / 6
    )
    assert await seeded.scalar(select(func.count()).select_from(UnmatchedIngredient)) == 0


# --- running a model -------------------------------------------------------------------


class FakeOllama:
    def __init__(self, answers, resident=()):
        self.answers = list(answers)
        self.resident = list(resident)
        self.chats = 0
        self.keep_alive: list[tuple[str, object]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/ps":
            models = [{"name": m, "size": 3_300_000_000} for m in self.resident]
            return httpx.Response(200, json={"models": models})
        if request.url.path == "/api/generate":
            body = json.loads(request.content)
            self.keep_alive.append((body["model"], body["keep_alive"]))
            if body["keep_alive"] == -1:
                self.resident.append(body["model"])
            return httpx.Response(200, json={"done": True})
        self.chats += 1
        response = chat_response(self.answers.pop(0))
        body = response.json() | {"usage": {"prompt_tokens": 1164, "completion_tokens": 250}}
        return httpx.Response(200, json=body)


def bench_args(tmp_path, **overrides) -> argparse.Namespace:
    args = parse_args(
        ["--data", str(tmp_path), "--models", "m", "--url", "http://ollama.test/v1"]
        + ["--out", str(tmp_path / "out.jsonl")]
    )
    return argparse.Namespace(**(vars(args) | overrides))


async def run(tmp_path, fake, samples, **overrides):
    from benchmark.run import UsageLog

    args = bench_args(tmp_path, **overrides)
    usage = UsageLog()
    transport = httpx.MockTransport(fake)
    async with httpx.AsyncClient(transport=transport, event_hooks={"response": [usage]}) as c:
        for model in args.models:
            await run_model(args, c, usage, model, [(tmp_path, s) for s in samples], args.out)
    return [json.loads(line) for line in args.out.read_text().splitlines()]


@pytest.fixture
def photos(tmp_path):
    for name in ("s1", "s2"):
        (tmp_path / f"{name}.jpg").write_bytes(jpeg_bytes((2000, 1500)))
    return [sample("s1"), sample("s2")]


async def test_run_writes_rows_tokens_and_ram_and_unloads_the_model(seeded, tmp_path, photos):
    fake = FakeOllama([json.dumps(PLATE), "not json"])
    rows = await run(tmp_path, fake, photos)

    samples = [r for r in rows if r["type"] == "sample"]
    assert [(r["sample"], r["ok"]) for r in samples] == [("s1", True), ("s2", False)]
    assert samples[0]["prompt_tokens"] == 1164 and samples[0]["completion_tokens"] == 250
    assert samples[0]["answer"]["dish"] == "Chicken rice bowl"
    assert samples[0]["max_px"] == 896
    assert "invalid response" in samples[1]["error"]
    assert [r["ram_gb"] for r in rows if r["type"] == "model"] == [3.3]
    assert fake.keep_alive == [("m", -1), ("m", 0)]  # loaded up front, unloaded after


async def test_run_resumes_and_keeps_a_model_that_was_already_loaded(seeded, tmp_path, photos):
    await run(tmp_path, FakeOllama([json.dumps(PLATE)]), photos[:1])

    fake = FakeOllama([json.dumps(PLATE)], resident=["m"])
    rows = await run(tmp_path, fake, photos)

    assert fake.chats == 1  # s1 was done already
    assert [r["sample"] for r in rows if r["type"] == "sample"] == ["s1", "s2"]
    assert ("m", 0) not in fake.keep_alive  # production's model stays in RAM


async def test_run_records_unreachable_server_as_failed(seeded, tmp_path, photos):
    def down(request):
        raise httpx.ConnectError("refused", request=request)

    rows = await run(tmp_path, down, photos[:1])
    assert [(r["ok"], "request failed" in r["error"]) for r in rows if r["type"] == "sample"] == [
        (False, True)
    ]


def test_args_reject_unknown_prompt(tmp_path):
    with pytest.raises(SystemExit):
        parse_args(["--data", str(tmp_path), "--models", "m", "--prompts", "v1,nope"])


# --- report ----------------------------------------------------------------------------


def test_report_has_one_line_per_model_and_prompt(tmp_path):
    rows = [
        {"type": "model", "model": "a", "ram_gb": 3.31},
        {
            "type": "sample",
            "model": "a",
            "prompt": "v1",
            "source": "x",
            "ok": True,
            "kcal_err_pct": -20,
            "latency_s": 12,
        },
        {
            "type": "sample",
            "model": "b",
            "prompt": "v1",
            "source": "x",
            "ok": False,
            "latency_s": 5,
        },
    ]
    path = tmp_path / "r.jsonl"
    path.write_text("".join(json.dumps(r) + "\n" for r in rows) + "\n")
    samples, ram = report.read_rows([path])
    lines = report.table(samples, ram).splitlines()

    assert len(lines) == 4
    assert lines[2].startswith("| a | v1 | 1 | 100% |") and "| 20% | -20% |" in lines[2]
    assert "3.3 GB" in lines[2]
    assert lines[3].startswith("| b | v1 | 1 | 0% |") and lines[3].endswith("| – |")
    assert "| x |" in report.table(samples, ram, by_source=True)


# --- datasets: Nutrition5k + our meals -------------------------------------------------


def test_nutrition5k_pick_keeps_test_split_meals_reproducibly():
    samples = [
        sample("t1"),
        sample("t2"),
        sample("t3"),
        sample("train", kcal=600),
        sample("scraps", items=(("rice", 40),)),
        sample("low", kcal=50),
    ]
    test_ids = {"t1", "t2", "t3", "scraps", "low"}
    picked = nutrition5k.pick(samples, test_ids, 0, seed=1)
    assert {s.id for s in picked} == {"t1", "t2", "t3"}
    assert picked == nutrition5k.pick(list(reversed(samples)), test_ids, 0, seed=1)
    assert len(nutrition5k.pick(samples, test_ids, 2, seed=1)) == 2


def test_nutrition5k_build_skips_dishes_without_a_photo(tmp_path):
    rows = {
        "dish_a": "dish_a,300,200,10,30,20,i1,rice,200,260,1,56,5",
        "dish_b": "dish_b,400,250,10,30,20,i1,pasta,250,390,2,80,14",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("cafe1.csv"):
            return httpx.Response(200, text="\n".join(rows.values()) + "\n")
        if path.endswith("cafe2.csv"):
            return httpx.Response(200, text="")
        if path.endswith("depth_test_ids.txt"):
            return httpx.Response(200, text="dish_a\ndish_b\n")
        if "dish_a" in path:
            return httpx.Response(404)
        return httpx.Response(200, content=jpeg_bytes((640, 480)))

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert nutrition5k.build(client, tmp_path, n=5, seed=1) == 1
    assert [s.id for s in dataset.load(tmp_path)] == ["dish_b"]
    assert (tmp_path / "dish_b.jpg").read_bytes()[:2] == b"\xff\xd8"


def test_meal_sample_is_one_plate_with_per_portion_totals():
    rice = Ingredient(name="Rice", kcal=130, protein=2.7, carbs=28, fat=0.3, fiber=0.4, sugar=0)
    meal = Meal(id=7, name="Rice bowl", portions=2, nutrients_override=None)
    meal.ingredients = [MealIngredient(grams=400, ingredient=rice)]

    s = meal_sample(meal)
    assert s["items"] == [{"name": "Rice", "grams": 200.0}]
    assert s["totals"] == {"kcal": 260.0, "protein": 5.4, "carbs": 56.0, "fat": 0.6}
    assert s["image"] == "meal-7.jpg" and s["notes"] == {"overridden": False}

    meal.nutrients_override = {
        "kcal": 500,
        "protein": 20,
        "carbs": 60,
        "fat": 15,
        "fiber": 3,
        "sugar": 2,
    }
    assert meal_sample(meal)["totals"]["kcal"] == 500


def test_household_write_saves_photos_and_manifest(tmp_path):
    photo = jpeg_bytes()
    line = {
        "id": "meal-1",
        "image": "meal-1.jpg",
        "source": "household",
        "dish": "Pasta",
        "items": [{"name": "Pasta", "grams": 120}],
        "totals": {"kcal": 450, "protein": 15, "carbs": 80, "fat": 8},
        "jpeg": base64.b64encode(photo).decode(),
    }
    lines = ["warning: something from docker", json.dumps(line)]
    assert household.write(lines, tmp_path) == 1
    assert (tmp_path / "meal-1.jpg").read_bytes() == photo
    assert dataset.load(tmp_path)[0].dish == "Pasta"


def test_household_dump_only_needs_the_app_package():
    source = open(household.household_dump.__file__).read()
    assert "benchmark" not in source.replace('"""', "").split("import asyncio")[1]
