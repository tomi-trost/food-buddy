# Ideas & open questions

Status: idea · planned · done · dropped

| Date | Idea / question | Status |
|---|---|---|
| 2026-10-04 | Pick the real stack (web + native): Expo/React Native vs Capacitor + web framework | done (React + Vite PWA, live; Capacitor APK deferred, 0017) |
| 2026-10-04 | Which AI/vision API for dish + macro detection; nutrition DB source | done (`qwen3-vl:4b-instruct` on Oracle + USDA/Ciqual/OFF; 0018 accepted after the M3 second comparison) |
| 2026-10-04 | Price estimation source (manual vs store price DB vs learned from past receipts) | open |
| 2026-10-04 | Sync/auth between the two users (shared household, offline-first?) | done (household auth); offline write queue planned (next-up #7) |
| 2026-10-04 | Plan variety rules: avoid the same breakfast all week (shopping list currently balloons with repeats) | planned (next-up #5, optional: off unless chosen) |
| 2026-10-04 | Choose which day the meal-prep batch is cooked; show a "prep session" entry in the plan | planned (next-up #5) |
| 2026-10-04 | Weekly challenge rewards/streak history for the Versus tab | idea |
| 2026-10-04 | Sensible default buy quantities per ingredient (instead of 250 g) | planned (next-up #6) |
| 2026-10-04 | Show who is responsible for cooking each meal in the plan (user avatar(s) in slot metadata; assign You / Partner / Both; fairness stats in Versus) | planned (next-up #5, optional) |
| 2026-10-04 | AI button on a meal → generate a variation (e.g. "Asian swap", "make it vegetarian", "high-protein version") and save it as a new meal linked to the original | idea |
| 2026-10-04 | Healthy ingredient swaps via an ingredient–flavor-compound bipartite graph (ingredients ↔ shared aroma/flavor compounds, cf. FlavorGraph/Flavor Network): suggest similar-tasting substitutes with less fat/sugar/kcal; show macro delta before applying | idea |
| 2026-10-04 | Use fullness feedback ("left us hungry"/"too heavy") to auto-suggest carb/fiber portion changes and feed the menu generator | idea |
| 2026-10-04 | Sweets story: temptation triggers (time of day, after which meal), weekly treat budget, streak of treat-free days | streak done (croissant rewards, goal calendar); triggers + weekly budget idea |
| 2026-10-04 | Barcode scan for packaged snacks (Open Food Facts) as a fallback/validation for label OCR | done 2026-10-13 (decision 0023) |
| 2026-10-04 | Let the user correct label-scan values before logging (editable table) and remember products | correcting done 2026-10-12; remembering scanned (barcode) products done 2026-10-13, decision 0023 |
| 2026-10-04 | NEXT SESSION: decide tech stack, deployment options and app serving, then write the implementation plan | done (docs/design-plan.md) |
| 2026-10-04 | Which phones (iPhone/Android)? Pay Apple 99 USD/yr or use home-screen web on iOS | done (both iPhone → PWA, no fee; Android APK too) |
| 2026-10-04 | Raspberry Pi model/RAM + SSD → decides local model size | done (Pi 3 B, 1 GB, SD → monitor only) |
| 2026-10-04 | Which Jetson: original Nano (no usable LLM GPU) or Orin Nano (AI node)? | done (original Nano → backup/standby, 0016) |
| 2026-10-04 | Domain: DuckDNS vs own domain; public URL vs Tailscale-only | done (Cloudflare domain + Cloudflare Tunnel) |
| 2026-10-04 | Offload inference to a home Mac (Ollama over Tailscale) when it is on | dropped (Jetson instead) |
| 2026-10-04 | Allow Gemini free tier as an emergency fallback, or strictly open source? | dropped (0019: nothing paid/closed) |
| 2026-10-04 | Household portion priors learned from corrections (e.g. our rice portion ≈ 180 g) fed into the prompt | done 2026-10-13 (`app/analysis/priors.py`) |
| 2026-10-04 | Open-source license: AGPL-3.0 vs MIT; when to make the repo public | open (parked) |
| 2026-10-04 | Move Jetson backups onto a USB disk instead of the SD card | idea |
| 2026-10-04 | A GPU machine later = just another URL in VISION_PROVIDERS | idea |
| 2026-10-05 | Edit the snack name and per-100 g values after a label scan (model names are sometimes vague, e.g. "non-detectable") | done 2026-10-12 (Edit values; products editable in Edit meal) |
| 2026-10-05 | Undo after posting a meal (the mock's toast had Undo; the real app doesn't yet) | done 2026-10-13 (10 min, `meals/undo.py`) |
| 2026-10-05 | Delete/edit food log entries (wrong portion, logged twice) | done 2026-10-12 (Home → Today: portions, amount, values, remove) |
| 2026-10-05 | Service worker serves the previous app version until reload; show an "update available" prompt | done 2026-10-13 (`web/src/layout/UpdatePrompt.tsx`) |
| 2026-10-05 | Edit a meal's ingredients and steps after posting | done (ingredients etc. 2026-10-12, steps 2026-10-13) |
| 2026-10-12 | Taste stars: drag/slide a finger across the stars to set the rating (half-step snapping), tapping alone is fiddly on the phone | done (2026-10-12) |
| 2026-10-12 | Edit the macro values the model read (kcal, carbs, protein, fat, fiber, sugar): label scan shows them read-only, so a misread number can't be fixed. Meals: macros come from the matched ingredients (grams/ingredients are editable), but a manual per-ingredient or total override may be wanted too | done 2026-10-12: snacks + labels (Edit values), meals (per-portion override on the check screen and the edit page) |
| 2026-10-12 | "Login failed" in Safari while a private tab works: Cloudflare Access session expired, the cached app shell never passed Access again | done 2026-10-12 (`/api/reauth` full-page round trip) |
| 2026-10-12 | Suggest what I ate to my partner as their meal, accept or refuse | done 2026-10-12 (Home "You too?" card + push) |
| 2026-10-12 | Today's "+" per meal: add an existing meal instead of a photo | done 2026-10-12 (picker sheet; cooked now / already made, portions) |
| 2026-10-12 | Meals list: log a meal as cooked for breakfast/lunch/dinner straight from its card | done 2026-10-12 |
| 2026-10-12 | Save photographed snacks (home-made tiramisu) and find them under Meals → Snacks | done 2026-10-12 (saved snacks with photo, shared in the household) |
| 2026-10-12 | Add a meal or snack by typing its name; the model estimates ingredients/values | done 2026-10-12 (no photo yet: shows the emoji) |
| 2026-10-12 | Picture for typed meals (stock photo or generated) | idea (no image model on the VM; Openverse/Wikimedia lookup would be the free option) |
| 2026-10-12 | Push texts say "photo" for typed dishes too ("Couldn't analyze the photo") | idea |
| 2026-10-12 | With photo, library, typing and our meals, replace the black camera page with a clean "add food" view (camera still the main option); "+" instead of the camera icon | done 2026-10-12 (Add food bottom sheet) |
| 2026-10-24 | Bundles: a plate holds dishes of ours (pancakes under the fruit), "Make it its own dish" (#17) | done 2026-10-24 (decision 0029) |
| 2026-10-24 | Aliases: the photo's name for a swapped item offers our dish next time (#18) | done 2026-10-24 (decision 0029) |
| 2026-10-24 | "By dish": big family cards with a collage of the 3 best-rated dishes | done 2026-10-24 |
| 2026-10-24 | Nested bundles (a dish holding dishes) | idea (one level deep for now, 0029) |
| 2026-10-24 | Count a dish as cooked when a plate holding it is cooked (its "cooked N×" / last cooked) | idea |
| 2026-10-25 | **How long a meal keeps us full.** Per person and meal: the time until the next meal, and any snacks in between (count, kcal). Needs the real eating time on every log: photo posts use the post time; meals logged from Meals / "+" / "You too?" ask "when did you eat?" (default now; the food log has only a date today). Then a fullness graph per meal and dish family ("keeps you full ~4 h"), and a push some time after a meal ("Still full?" Yes / Getting hungry) to get the real hungry-again time, adjusted to each person. Links to the "How filling" slider and the menu generator | idea |
| 2026-10-25 | Save the original photos to a "Food Buddy" album in Photos: a PWA can't write to Photos, so Settings switch → "Save photo" button via the share sheet + an iOS Shortcut that saves to the album | done 2026-10-25 (`lib/originals.ts`) |
