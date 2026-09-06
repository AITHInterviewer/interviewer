"""`AnthropicJSONClient` — конверт вызова Messages API и ретраи на 429/5xx."""

from __future__ import annotations

import httpx
import pytest

from app.services.llm import AnthropicJSONClient, LLMError


def _client(handler) -> AnthropicJSONClient:
    client = AnthropicJSONClient(api_key="k", base_url="https://example.test")
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return client


@pytest.mark.anyio
async def test_returns_text_blocks_joined() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/messages"
        assert request.headers["x-api-key"] == "k"
        return httpx.Response(
            200, json={"content": [{"type": "text", "text": "ито"}, {"type": "text", "text": "г"}]}
        )

    assert await _client(handler).complete("sys", "usr") == "итог"


@pytest.mark.anyio
async def test_retries_on_429_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.llm.asyncio.sleep", lambda _: _noop())
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, json={"error": "rate limited"})
        return httpx.Response(200, json={"content": [{"type": "text", "text": "ok"}]})

    assert await _client(handler).complete("sys", "usr") == "ok"
    assert calls == 2


@pytest.mark.anyio
async def test_raises_llm_error_after_exhausting_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.llm.asyncio.sleep", lambda _: _noop())

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "unavailable"})

    with pytest.raises(LLMError):
        await _client(handler).complete("sys", "usr")


@pytest.mark.anyio
async def test_no_api_key_raises_llm_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client = AnthropicJSONClient(base_url="https://example.test")
    with pytest.raises(LLMError):
        await client.complete("sys", "usr")


async def _noop() -> None:
    return None
