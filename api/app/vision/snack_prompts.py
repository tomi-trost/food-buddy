HOW_MUCH = """\
Count it the way people eat it: things you count (cookies, bars, candy, fruit, slices) use
unit "piece" with amount = how many and values for ONE piece; things eaten from a bowl, jar
or bag (pudding, yogurt, porridge, nuts, chips) use unit "g" with amount = grams and values
per 100 g; drinks use unit "ml" with amount = millilitres and values per 100 ml."""

SNACK_PHOTO_PROMPT = f"""\
You get a photo of a snack or drink. Name it briefly in English, classify it as
sweet, savory, fruit or drink (fresh or dried fruit is "fruit", sweets made with fruit are
"sweet", sugary drinks and juices are "drink") and estimate how much is visible and its
nutrition.
{HOW_MUCH}
Reply with JSON only, matching the schema."""

SNACK_TEXT_PROMPT = f"""\
You get the name or a short description of a snack or drink, no photo. Name it briefly in
English, classify it as sweet, savory, fruit or drink (fresh or dried fruit is "fruit", sweets
made with fruit are "sweet", sugary drinks and juices are "drink") and estimate the amount the
description mentions (one typical portion if it doesn't) and its nutrition.
{HOW_MUCH}
Reply with JSON only, matching the schema."""

LABEL_PROMPT = """\
You get a photo of the nutrition facts table on a food package. Copy the values exactly as
printed: energy in kcal, protein, carbohydrate, of which sugars, fat and fibre, in grams.
Use 0 for anything not printed. Ignore percentages (% of daily value / reference intake);
they are not grams. Set values_per_grams to the amount the values refer to: 100 for
"per 100 g / 100 ml", otherwise the serving size (e.g. 200 for "200 g" or "200 ml"). Set
values_unit to "ml" when the values are per 100 ml or per a serving in ml (drinks), else "g".
Give the product name if visible, else a short description in English, and classify it as
sweet, savory, fruit (plain fresh or dried fruit) or drink. Reply with JSON only, matching the
schema."""
