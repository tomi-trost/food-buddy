# Local development helpers. See docs/execution-plan.md → Local development.
COMPOSE_DEV = docker compose -f deploy/compose.yaml -f deploy/compose.dev.yaml
BIN = .venv/bin

.PHONY: setup db api worker web ollama test test-api test-web lint stack stack-down

setup:            ## create the Python venv and install npm packages
	cd api && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
	cd web && npm install

db:               ## Postgres on localhost:5433
	$(COMPOSE_DEV) up -d --wait db

api: db           ## API with reload on :8000 (migrates + seeds first)
	cd api && $(BIN)/alembic upgrade head && $(BIN)/python -m app.nutrition.seed && $(BIN)/uvicorn app.main:app --reload

worker: db        ## background worker (vision jobs)
	cd api && $(BIN)/procrastinate --app=app.jobs.jobs_app worker

web:              ## Vite dev server on :5173 (proxies /api to :8000)
	cd web && npm run dev

ollama:           ## Ollama with the default vision model (uses the Mac's GPU if installed natively)
	ollama pull qwen3-vl:2b-instruct

test: test-api test-web

test-api: db
	cd api && $(BIN)/pytest -q

test-web:
	cd web && npm test

lint:
	cd api && $(BIN)/ruff check . && $(BIN)/ruff format --check .
	cd web && npm run typecheck

stack:            ## the full production-like stack on http://localhost:8080
	cd deploy && docker compose up -d --build --wait

stack-down:
	cd deploy && docker compose down
