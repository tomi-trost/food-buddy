import json

import httpx
import pytest

from app.config import VisionProviderConfig
from app.vision.providers import (
    AllProvidersFailed,
    OpenAICompatibleProvider,
    ProviderError,
    VisionChain,
)
from tests.fakes import PLATE, vision_transport


def provider(transport, name="p", url="http://vision.test/v1"):
    config = VisionProviderConfig(name=name, url=url, model="qwen3-vl:4b")
    return OpenAICompatibleProvider(config, httpx.AsyncClient(transport=transport))


async def test_sends_image_and_schema_and_parses_answer():
    seen: list[httpx.Request] = []
    result = await provider(vision_transport(seen=seen)).analyze_meal(b"\xff\xd8jpeg")

    assert result.dish == "Chicken rice bowl"
    assert [i.name for i in result.ingredients][:2] == ["grilled chicken breast", "cooked rice"]

    request = seen[0]
    assert str(request.url) == "http://vision.test/v1/chat/completions"
    body = json.loads(request.content)
    assert body["model"] == "qwen3-vl:4b"
    assert body["response_format"]["json_schema"]["schema"]["properties"]["ingredients"]
    image = body["messages"][1]["content"][1]["image_url"]["url"]
    assert image.startswith("data:image/jpeg;base64,")


async def test_accepts_answer_wrapped_in_code_fence():
    fenced = "```json\n" + json.dumps(PLATE) + "\n```"
    result = await provider(vision_transport(fenced)).analyze_meal(b"x")
    assert result.servings == 1


@pytest.mark.parametrize(
    "content",
    [
        "not json",
        json.dumps({**PLATE, "meal_type": "brunch"}),  # not an allowed value
        json.dumps({**PLATE, "ingredients": [{"name": "x", "grams": -5, "confidence": 1}]}),
        json.dumps({**PLATE, "extra": "field"}),
    ],
)
async def test_invalid_answers_raise_provider_error(content):
    with pytest.raises(ProviderError):
        await provider(vision_transport(content)).analyze_meal(b"x")


async def test_empty_answer_from_thinking_model_explains_fix():
    def handler(request):
        message = {"content": "", "reasoning": "Got it, let's analyze..."}
        return httpx.Response(
            200, json={"choices": [{"message": message, "finish_reason": "length"}]}
        )

    with pytest.raises(ProviderError, match="finish_reason=length.*instruct"):
        await provider(httpx.MockTransport(handler)).analyze_meal(b"x")


async def test_http_error_raises_provider_error():
    with pytest.raises(ProviderError):
        await provider(vision_transport(status=500)).analyze_meal(b"x")


async def test_chain_falls_back_to_next_provider():
    chain = VisionChain(
        [
            provider(vision_transport(status=503), name="down"),
            provider(vision_transport(), name="up"),
        ]
    )
    name, result = await chain.analyze_meal(b"x")
    assert name == "up"
    assert result.dish == "Chicken rice bowl"


async def test_chain_reports_every_failure():
    chain = VisionChain(
        [
            provider(vision_transport(status=503), name="a"),
            provider(vision_transport("nope"), name="b"),
        ]
    )
    with pytest.raises(AllProvidersFailed) as info:
        await chain.analyze_meal(b"x")
    assert set(info.value.errors) == {"a", "b"}


async def test_empty_chain_fails():
    with pytest.raises(AllProvidersFailed, match="none configured"):
        await VisionChain([]).analyze_meal(b"x")
