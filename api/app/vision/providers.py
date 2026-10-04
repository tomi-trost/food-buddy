"""Vision model access through any OpenAI-compatible chat API (Ollama, llama.cpp, vLLM)."""

import base64
import re

import httpx
from pydantic import ValidationError

from app.config import Settings, VisionProviderConfig
from app.vision.prompt import MEAL_SYSTEM_PROMPT
from app.vision.schemas import MealAnalysis


class ProviderError(Exception):
    pass


class AllProvidersFailed(Exception):
    def __init__(self, errors: dict[str, str]):
        self.errors = errors
        detail = "; ".join(f"{name}: {err}" for name, err in errors.items()) or "none configured"
        super().__init__(f"No vision provider succeeded ({detail})")


_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$")


class OpenAICompatibleProvider:
    def __init__(self, config: VisionProviderConfig, client: httpx.AsyncClient):
        self.config = config
        self.client = client

    @property
    def name(self) -> str:
        return self.config.name

    async def analyze_meal(self, jpeg: bytes) -> MealAnalysis:
        image_url = "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()
        payload = {
            "model": self.config.model,
            "temperature": 0.1,
            "messages": [
                {"role": "system", "content": MEAL_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Analyze this meal."},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                },
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "meal_analysis",
                    "schema": MealAnalysis.model_json_schema(),
                    "strict": True,
                },
            },
        }
        url = self.config.url.rstrip("/") + "/chat/completions"
        try:
            response = await self.client.post(url, json=payload, timeout=self.config.timeout_s)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderError(f"request failed: {exc!r}") from exc
        try:
            choice = response.json()["choices"][0]
            content = choice["message"].get("content") or ""
            if not content.strip():
                # Seen with "thinking" models (e.g. qwen3-vl:2b): all tokens go to reasoning.
                raise ProviderError(
                    f"empty answer (finish_reason={choice.get('finish_reason')}); "
                    "use an instruct/non-thinking model tag such as qwen3-vl:4b-instruct"
                )
            return MealAnalysis.model_validate_json(_FENCE.sub("", content))
        except (KeyError, IndexError, TypeError, ValueError, ValidationError) as exc:
            raise ProviderError(f"invalid response: {exc}") from exc


class VisionChain:
    """Tries providers in order; the first valid answer wins."""

    def __init__(self, providers: list[OpenAICompatibleProvider]):
        self.providers = providers

    async def analyze_meal(self, jpeg: bytes) -> tuple[str, MealAnalysis]:
        errors: dict[str, str] = {}
        for provider in self.providers:
            try:
                return provider.name, await provider.analyze_meal(jpeg)
            except ProviderError as exc:
                errors[provider.name] = str(exc)
        raise AllProvidersFailed(errors)


def chain_from_settings(settings: Settings, client: httpx.AsyncClient) -> VisionChain:
    return VisionChain([OpenAICompatibleProvider(c, client) for c in settings.vision_providers])
