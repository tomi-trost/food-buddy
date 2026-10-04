SNACK_PHOTO_PROMPT = """\
You get a photo of a snack or drink. Name it briefly in English, classify it as
sweet, savory or drink (sugary drinks are "drink"), count the visible pieces and estimate
the nutrition of ONE piece or portion. Reply with JSON only, matching the schema."""

LABEL_PROMPT = """\
You get a photo of the nutrition facts table on a food package. Copy the values exactly as
printed: energy in kcal, protein, carbohydrate, of which sugars, fat and fibre, in grams.
Use 0 for anything not printed. Ignore percentages (% of daily value / reference intake);
they are not grams. Set values_per_grams to the amount the values refer to: 100 for
"per 100 g / 100 ml", otherwise the serving size in grams (e.g. 200 for "200 g").
Give the product name if visible, else a short description in English, and classify it as
sweet, savory or drink. Reply with JSON only, matching the schema."""
