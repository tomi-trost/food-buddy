"""Model access through any OpenAI-compatible chat API (Ollama, llama.cpp, vLLM).

Every call asks for JSON matching a Pydantic model (sent as the response schema) and validates
the answer, so callers only ever see typed results or a ProviderError.
"""

import base64
import re
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.config import Settings, VisionProviderConfig
from app.vision.prompt import MEAL_SYSTEM_PROMPT
from app.vision.schemas import MealAnalysis

T = TypeVar("T", bound=BaseModel)


class ProviderError(Exception):
    pass


class AllProvidersFailed(Exception):
    def __init__(self, errors: dict[str, str]):
        self.errors = errors
        detail = "; ".join(f"{name}: {err}" for name, err in errors.items()) or "none configured"
        super().__init__(f"No vision provider succeeded ({detail})")


_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$")


def image_message(text: str, jpeg: bytes) -> dict:
    url = "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()
    return {
        "role": "user",
        "content": [
            {"type": "text", "text": text},
            {"type": "image_url", "image_url": {"url": url}},
        ],
    }


class OpenAICompatibleProvider:
    def __init__(self, config: VisionProviderConfig, client: httpx.AsyncClient):
        self.config = config
        self.client = client

    @property
    def name(self) -> str:
        return self.config.name

    async def chat_json(self, messages: list[dict], answer: type[T], temperature=0.1) -> T:
        payload = {
            "model": self.config.model,
            "temperature": temperature,
            "messages": messages,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": answer.__name__,
                    "schema": answer.model_json_schema(),
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
            return answer.model_validate_json(_FENCE.sub("", content))
        except (KeyError, IndexError, TypeError, ValueError, ValidationError) as exc:
            raise ProviderError(f"invalid response: {exc}") from exc

    async def analyze_meal(self, jpeg: bytes) -> MealAnalysis:
        messages = [
            {"role": "system", "content": MEAL_SYSTEM_PROMPT},
            image_message("Analyze this meal.", jpeg),
        ]
        return await self.chat_json(messages, MealAnalysis)


class VisionChain:
    """Tries providers in order; the first valid answer wins."""

    def __init__(self, providers: list[OpenAICompatibleProvider]):
        self.providers = providers

    async def chat_json(self, messages: list[dict], answer: type[T]) -> tuple[str, T]:
        errors: dict[str, str] = {}
        for provider in self.providers:
            try:
                return provider.name, await provider.chat_json(messages, answer)
            except ProviderError as exc:
                errors[provider.name] = str(exc)
        raise AllProvidersFailed(errors)

    async def analyze_meal(self, jpeg: bytes) -> tuple[str, MealAnalysis]:
        messages = [
            {"role": "system", "content": MEAL_SYSTEM_PROMPT},
            image_message("Analyze this meal.", jpeg),
        ]
        return await self.chat_json(messages, MealAnalysis)


def chain_from_settings(settings: Settings, client: httpx.AsyncClient) -> VisionChain:
    return VisionChain([OpenAICompatibleProvider(c, client) for c in settings.vision_providers])
