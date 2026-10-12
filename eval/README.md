# Model benchmark (M3)

Runs vision models over labelled plate photos through the app's own pipeline (shrink to
`vision_max_px` → OpenAI-compatible endpoint with the JSON schema → catalog grounding) and
scores the result. Code: `api/benchmark/`. Data (`eval/data/`) and raw results
(`eval/results/*.jsonl`) are not committed; summaries are (`eval/results/*.md`).

## Datasets

```sh
cd api
.venv/bin/python -m benchmark.nutrition5k --n 40     # → eval/data/nutrition5k (CC BY 4.0)
.venv/bin/python -m benchmark.household              # our posted meals from the VM (ssh food-buddy)
```

- **Nutrition5k**: cafeteria plates with every ingredient weighed (Google, 2021). Overhead
  photos of the `depth` test split, plates with ≥100 kcal and ≥100 g, random with a fixed seed.
- **Household**: our posted meals with a photo; the truth is the saved plate (recipe ÷ portions),
  i.e. our corrections. It's only as good as those: **weigh the plate before posting** to make a
  meal count. Photos stay local (gitignored).

## Run

Needs the dev database for the ingredient catalog (`make db`); nothing is written to it.

```sh
# accuracy: any Ollama, e.g. the Mac (fast)
.venv/bin/python -m benchmark.run --data ../eval/data/nutrition5k --data ../eval/data/household \
    --models qwen3-vl:4b-instruct,qwen3-vl:2b-instruct --prompts v1,v2 --out ../eval/results/mac.jsonl

# speed + RAM: the VM's Ollama through a tunnel (shares the 2 cores with the live app)
ssh -f -N -o ServerAliveInterval=20 -L 11435:$(ssh food-buddy "docker inspect -f \
    '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' food-buddy-ollama-1"):11434 food-buddy
.venv/bin/python -u -m benchmark.run --data ../eval/data/nutrition5k --limit 5 \
    --models qwen3-vl:4b-instruct --url http://localhost:11435/v1 --out ../eval/results/vm.jsonl

.venv/bin/python -m benchmark.report ../eval/results/mac.jsonl [--by-source]
```

Runs resume: finished (model, prompt, photo) rows are skipped. Models that weren't loaded before
are unloaded afterwards, so production's model stays in RAM. Prompts live in
`api/benchmark/prompts.py` (`v1` = what the app sends).

## Metrics

- **ingr. P / R**: share of named ingredients that were really on the plate / of real
  ingredients ≥ 5 g that were named, both after matching to the catalog. **mass R**: recall
  weighted by grams.
- **kcal / macro / grams err**: median of |predicted − true| / true, predicted = model grams ×
  catalog values (unmatched names count as 0, as in the app). **kcal bias**: median signed error.
- **latency**: wall time per photo (includes image encoding); **RAM**: Ollama's resident size.

Caveats: Nutrition5k plates are small cafeteria portions shot from straight above, unlike our
plates; its truth uses USDA values while we ground with our catalog, so even a perfect answer
shows a few % error. CPU and Metal give slightly different outputs from the same weights.
