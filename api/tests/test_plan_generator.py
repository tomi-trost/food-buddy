from app.plan.generator import Candidate, batches, eligible, generate, prep_options, round_up_to

OATS = Candidate(1, ("breakfast",), 5, 2, 4.0, ("prep-friendly",))
TOAST = Candidate(2, ("breakfast",), 10, 2, 4.7)
BOWL = Candidate(3, ("lunch",), 20, 2, 4.3, ("prep-friendly",))
CURRY = Candidate(4, ("lunch", "dinner"), 30, 4, 3.7, ("prep-friendly",))
STIRFRY = Candidate(5, ("dinner",), 25, 2, 4.8)
BOLO = Candidate(6, ("dinner",), 45, 3, None)
MEALS = [OATS, TOAST, BOWL, CURRY, STIRFRY, BOLO]


def cook(minutes):
    return {"mode": "cook", "minutes": minutes}


def test_eligible_filters_time_and_type_and_ranks_unrated_as_three():
    assert [m.id for m in eligible(MEALS, "dinner", 30)] == [5, 4]
    assert [m.id for m in eligible(MEALS, "dinner", 60)] == [5, 4, 6]  # 4.8, 3.7, unrated=3
    assert [m.id for m in eligible(MEALS, "dinner", 60, exclude=[5])] == [4, 6]
    assert [m.id for m in prep_options(MEALS, "lunch")] == [3, 4]


def test_generate_avoids_repeats_until_options_run_out():
    wizard = [[cook(15), {"mode": "prep"}, cook(60)] for _ in range(4)]
    week = generate(MEALS, wizard)
    breakfasts = [d["breakfast"].meal_id for d in week.days]
    dinners = [d["dinner"].meal_id for d in week.days]
    assert breakfasts == [2, 1, 2, 2]  # toast, oats, then repeats allowed (best first)
    assert dinners == [5, 4, 6, 5]
    assert all(d["lunch"].mode == "prep" and d["lunch"].meal_id == 3 for d in week.days)


def test_out_skip_and_nothing_fitting():
    week = generate(MEALS, [[{"mode": "out"}, {"mode": "skip"}, cook(15)]])
    day = week.days[0]
    assert (day["breakfast"].mode, day["breakfast"].meal_id) == ("out", None)
    assert day["lunch"].mode == "skip"
    assert (day["dinner"].mode, day["dinner"].minutes, day["dinner"].meal_id) == ("cook", 15, None)


def test_batches_two_people_per_slot():
    # bowl (2 portions) in 3 slots → 6 portions → 3 cooks; curry (4) in 3 slots → 2 cooks
    assert batches([3, 3, 3, 4, 4, 4], {3: 2, 4: 4}) == {3: 3, 4: 2}


def test_round_up_to_50():
    assert [round_up_to(g) for g in (0, -10, 1, 50, 51, 249)] == [0, 0, 50, 50, 100, 250]
