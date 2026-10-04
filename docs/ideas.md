# Ideas & open questions

Status: idea · planned · done · dropped

| Date | Idea / question | Status |
|---|---|---|
| 2026-10-04 | Pick the real stack (web + native): Expo/React Native vs Capacitor + web framework | planned (PWA + Capacitor proposed, 0017) |
| 2026-10-04 | Which AI/vision API for dish + macro detection; nutrition DB source | planned (self-hosted Qwen3-VL on Oracle + USDA/Ciqual/OFF, 0018) |
| 2026-10-04 | Price estimation source (manual vs store price DB vs learned from past receipts) | open |
| 2026-10-04 | Sync/auth between the two users (shared household, offline-first?) | planned (household auth + cached offline, design-plan §3) |
| 2026-10-04 | Plan variety rules: avoid the same breakfast all week (shopping list currently balloons with repeats) | open |
| 2026-10-04 | Choose which day the meal-prep batch is cooked; show a "prep session" entry in the plan | open |
| 2026-10-04 | Weekly challenge rewards/streak history for the Versus tab | idea |
| 2026-10-04 | Sensible default buy quantities per ingredient (instead of 250 g) | idea |
| 2026-10-04 | Show who is responsible for cooking each meal in the plan (user avatar(s) in slot metadata; assign You / Partner / Both; fairness stats in Versus) | idea |
| 2026-10-04 | AI button on a meal → generate a variation (e.g. "Asian swap", "make it vegetarian", "high-protein version") and save it as a new meal linked to the original | idea |
| 2026-10-04 | Healthy ingredient swaps via an ingredient–flavor-compound bipartite graph (ingredients ↔ shared aroma/flavor compounds, cf. FlavorGraph/Flavor Network): suggest similar-tasting substitutes with less fat/sugar/kcal; show macro delta before applying | idea |
| 2026-10-04 | Use fullness feedback ("left us hungry"/"too heavy") to auto-suggest carb/fiber portion changes and feed the menu generator | idea |
| 2026-10-04 | Sweets story: temptation triggers (time of day, after which meal), weekly treat budget, streak of treat-free days | idea |
| 2026-10-04 | Barcode scan for packaged snacks (Open Food Facts) as a fallback/validation for label OCR | idea |
| 2026-10-04 | Let the user correct label-scan values before logging (editable table) and remember products | idea |
| 2026-10-04 | NEXT SESSION: decide tech stack, deployment options and app serving, then write the implementation plan | done (docs/design-plan.md) |
| 2026-10-04 | Which phones (iPhone/Android)? Pay Apple 99 USD/yr or use home-screen web on iOS | done (both iPhone → PWA, no fee; Android APK too) |
| 2026-10-04 | Raspberry Pi model/RAM + SSD → decides local model size | done (Pi 3 B, 1 GB, SD → monitor only) |
| 2026-10-04 | Which Jetson: original Nano (no usable LLM GPU) or Orin Nano (AI node)? | done (original Nano → backup/standby, 0016) |
| 2026-10-04 | Domain: DuckDNS vs own domain; public URL vs Tailscale-only | done (Cloudflare domain + Cloudflare Tunnel) |
| 2026-10-04 | Offload inference to a home Mac (Ollama over Tailscale) when it is on | dropped (Jetson instead) |
| 2026-10-04 | Allow Gemini free tier as an emergency fallback, or strictly open source? | dropped (0019: nothing paid/closed) |
| 2026-10-04 | Household portion priors learned from corrections (e.g. our rice portion ≈ 180 g) fed into the prompt | planned |
| 2026-10-04 | Open-source license: AGPL-3.0 vs MIT; when to make the repo public | open (parked) |
| 2026-10-04 | Move Jetson backups onto a USB disk instead of the SD card | idea |
| 2026-10-04 | A GPU machine later = just another URL in VISION_PROVIDERS | idea |
