# 0025 — Snacks are meals
Date: 2026-10-14 · Status: accepted (replaces "our snacks" / `saved_snack` from 2026-10-12)

**Context:** A home-made chia pudding logged as a snack could only get a name and six numbers: no ingredients, portions, ratings or fridge deduction. Meals have all of that. Two parallel libraries (meals and saved snacks) meant every feature had to be built twice, and snacks kept falling behind.
**Decision:** A snack is a `meal` whose `types` contain `snack`.
- `meal.snack_kind` (sweet | savory | fruit | drink) keeps treats and croissants working (0014, 0024): a snack logged from a meal is a food-log entry with `kind = snack`.
- `meal.per` says how it is logged: `portion` (a jar of pudding), `piece` (with `meal.piece_g`), `100g` or `100ml`. Values per unit come from the recipe: per portion ÷ grams per portion × grams per unit. The food-log entry keeps `per`, the amount and the values per unit, so the day screen edits it like before; editing the meal updates entries in the same unit.
- **Products** (scanned, label, catalog item saved): `meal.is_product`, one ingredient owned by the household (`ingredient.household_id`, `source = h<household id>` so names stay unique per household) holding the values per 100 g / 100 ml and how it's counted (`ingredient.unit`, `unit_grams`). Household ingredients are only found by that household's ingredient search, never by the model's matching. `household_product.meal_id` links a barcode to its product meal. A product's meal page is a simple view (amount, unit, values); "Add ingredients" in Edit meal turns it into a recipe (`is_product` off).
- Snack photos and typed snacks go through the meal analysis (ingredients and grams, the same check screen) with the meal type Snack. Labels and barcodes stay the product path; their "Save to our snacks" creates or updates a product meal.
- Logging a snack meal: amount in its unit. Products take the eaten amount out of stock if it's there; home-made snacks "made now" take the recipe out, "already made" don't. Each logged snack counts as "eaten" (cook log).
- Ratings and "You too?" work for snacks. The weekly plan only fills breakfast, lunch and dinner, so snacks never land in it.
- The quick-pick list still logs straight away, without a meal.
**Migration (0022):** every saved snack becomes a product meal (photo kept). Snacks saved per piece get a piece weight of 30 g: the values per piece stay exact, only grams taken from stock are a guess. Past food-log entries with the same name and unit are linked to the new meal; `saved_snack` is dropped.
**Alternatives:** Give saved snacks an optional ingredient list (two edit screens and two libraries to keep in step); products as meals without ingredients and typed-in values (no fridge or shopping list for products).
**Consequences:** One library, one edit screen. Phones on an older bundle lose "Our snacks" until they reload. Downgrading 0022 keeps snacks as meals (the old table comes back empty).
