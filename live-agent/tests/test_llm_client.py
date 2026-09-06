"""LLM-клиенты (Mistral/OpenRouter/Anthropic API) — без сети и без реальных ключей,
httpx.MockTransport вместо настоящего API. Намеренно НЕ используем купленные ключи из
секретов даже в CI — только фейковые "test-key"."""

import json

import httpx
import pytest

from ainterviewer.llm_client import AnthropicAPILiveControlLLM, MistralLiveControlLLM, OpenRouterLiveControlLLM
from ainterviewer.schema import Decision, GapType


def _llm_with_response(payload: dict) -> MistralLiveControlLLM:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": json.dumps(payload)}}]},
        )

    llm = MistralLiveControlLLM(model="mistral-small-latest", api_key="test-key")
    llm._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return llm


async def test_decide_parses_exhaustive_response():
    llm = _llm_with_response(
        {"decision": "exhaustive", "gap_type": None, "utterance": None, "reasoning": "ответ полный"}
    )

    result = await llm.decide("система", "вопрос")

    assert result.decision == Decision.EXHAUSTIVE
    assert result.utterance is None


async def test_decide_parses_gap_response():
    llm = _llm_with_response(
        {
            "decision": "gap",
            "gap_type": "drill_down",
            "utterance": "Расскажите подробнее про архитектуру решения.",
            "reasoning": "ответ поверхностный",
        }
    )

    result = await llm.decide("система", "вопрос")

    assert result.decision == Decision.GAP
    assert result.gap_type == GapType.DRILL_DOWN
    assert result.utterance == "Расскажите подробнее про архитектуру решения."


async def test_decide_raises_on_invalid_json():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "не json"}}]})

    llm = MistralLiveControlLLM(model="mistral-small-latest", api_key="test-key")
    llm._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    with pytest.raises(Exception):
        await llm.decide("система", "вопрос")


async def test_openrouter_decide_parses_response():
    """OpenRouterLiveControlLLM использует тот же протокол, что и Mistral (общая база
    _OpenAICompatibleLiveControlLLM) — проверяем, что подстановка сработала."""

    def handler(request: httpx.Request) -> httpx.Response:
        payload = {"decision": "ambiguous", "gap_type": None, "utterance": "Что-то добавите?", "reasoning": "коротко"}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(payload)}}]})

    llm = OpenRouterLiveControlLLM(model="google/gemini-2.0-flash-exp:free", api_key="test-key")
    llm._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    result = await llm.decide("система", "вопрос")

    assert result.decision == Decision.AMBIGUOUS
    assert result.utterance == "Что-то добавите?"


async def test_anthropic_api_decide_parses_tool_use_response():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "content": [
                    {
                        "type": "tool_use",
                        "name": "decide",
                        "input": {
                            "decision": "gap",
                            "gap_type": "leading_hint",
                            "utterance": "Подскажу один момент.",
                            "reasoning": "кандидат не знает",
                        },
                    }
                ]
            },
        )

    llm = AnthropicAPILiveControlLLM(model="claude-haiku-4-5", api_key="test-key", base_url="https://example.invalid")
    llm._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    result = await llm.decide("система", "вопрос")

    assert result.decision == Decision.GAP
    assert result.gap_type == GapType.LEADING_HINT
    assert result.utterance == "Подскажу один момент."
