"""Fake OpenAI-compatible vision servers for tests (no network)."""

import json

import httpx

PLATE = {
    "dish": "Chicken rice bowl",
    "meal_type": "dinner",
    "servings": 1,
    "ingredients": [
        {"name": "grilled chicken breast", "grams": 150, "confidence": 0.9},
        {"name": "cooked rice", "grams": 200, "confidence": 0.8},
        {"name": "olive oil", "grams": 10, "confidence": 0.4},
        {"name": "mystery sauce", "grams": 30, "confidence": 0.2},
    ],
}


def chat_response(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def vision_transport(content: str | dict = PLATE, status: int = 200, seen: list | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if status != 200:
            return httpx.Response(status, text="boom")
        return chat_response(content if isinstance(content, str) else json.dumps(content))

    return httpx.MockTransport(handler)
