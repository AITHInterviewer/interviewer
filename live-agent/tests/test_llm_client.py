"""MistralLiveControlLLM — без сети, httpx.MockTransport вместо реального API."""

import json

import httpx
import pytest

from ainterviewer.llm_client import MistralLiveControlLLM
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
