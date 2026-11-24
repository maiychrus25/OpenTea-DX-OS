# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Unit tests for ReplayProvider, OllamaProvider, JSON schema validation and 429 backoff."""
import email.message
import io
import json
import urllib.error

import pytest

from dxos_agent.providers import (
    LLMMessage,
    OllamaProvider,
    ProviderError,
    RateLimitError,
    ReplayProvider,
    SchemaValidationError,
    compute_input_hash,
)

SAMPLE_SCHEMA = {
    "type": "object",
    "required": ["ok", "reason"],
    "additionalProperties": False,
    "properties": {
        "ok": {"type": "boolean"},
        "reason": {"type": "string", "minLength": 2, "maxLength": 100},
    },
}


class _FakeHTTPResponse:
    def __init__(self, payload: dict) -> None:
        self._body = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_replay_provider_matches_input_hash_and_retries_invalid_schema_once():
    messages = [LLMMessage(role="user", content="check entry")]
    input_hash = compute_input_hash(messages, SAMPLE_SCHEMA)
    provider = ReplayProvider(
        fixtures={
            input_hash: [
                "{not-json",
                {"ok": True, "reason": "Hợp lệ"},
            ]
        }
    )
    res = provider.complete_json(messages, SAMPLE_SCHEMA)
    assert res.data == {"ok": True, "reason": "Hợp lệ"}
    assert res.provider == "replay"
    assert res.input_hash == input_hash


def test_replay_provider_raises_after_second_invalid_schema_attempt():
    messages = [LLMMessage(role="user", content="check bad output")]
    provider = ReplayProvider(
        fixtures={
            "default": [
                {"ok": True},
                {"ok": True, "reason": "ok", "extra": "disallowed"},
            ]
        }
    )
    with pytest.raises(SchemaValidationError):
        provider.complete_json(messages, SAMPLE_SCHEMA)


class _FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def _provider(urlopen_fn, clock=None, sleep_fn=None):
    return OllamaProvider(
        gateway_url="http://apisix:9081",
        token_provider=lambda: "agent-jwt",
        model="qwen2.5:0.5b",
        sleep_fn=sleep_fn or (lambda _: None),
        urlopen_fn=urlopen_fn,
        clock=clock or _FakeClock(),
    )


def _rate_limited(req, timeout, retry_after=None):
    del timeout
    headers = email.message.Message()
    if retry_after is not None:
        headers["Retry-After"] = retry_after
    raise urllib.error.HTTPError(req.full_url, 429, "Too Many Requests", headers, io.BytesIO(b""))


def test_ollama_provider_429_records_cool_down_without_sleeping_and_blocks_until_it_passes():
    clock = _FakeClock()
    sleeps = []
    calls = []

    def urlopen(req, timeout):
        calls.append(req.full_url)
        if len(calls) == 1:
            return _rate_limited(req, timeout, retry_after="15")
        return _FakeHTTPResponse(
            {"model": "qwen2.5:0.5b", "choices": [{"message": {"content": '{"ok": true, "reason": "Sau khi hết chờ"}'}}]}
        )

    provider = _provider(urlopen, clock=clock, sleep_fn=sleeps.append)
    messages = [LLMMessage(role="user", content="hi")]

    with pytest.raises(RateLimitError) as exc_info:
        provider.complete_json(messages, SAMPLE_SCHEMA)
    assert sleeps == []
    assert exc_info.value.retry_after_seconds == 60.0
    assert provider.next_allowed_at == clock.now + 60.0

    # Inside the window: rule-only callers get RateLimitError without any HTTP request.
    clock.now += 30.0
    with pytest.raises(RateLimitError):
        provider.complete_json(messages, SAMPLE_SCHEMA)
    assert len(calls) == 1

    # After the window the provider calls the gateway again.
    clock.now += 31.0
    assert provider.complete_json(messages, SAMPLE_SCHEMA).data == {"ok": True, "reason": "Sau khi hết chờ"}
    assert len(calls) == 2
    assert sleeps == []


def test_ollama_provider_sends_the_output_schema_in_the_system_prompt():
    captured = {}

    def urlopen(req, timeout):
        del timeout
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return _FakeHTTPResponse({"choices": [{"message": {"content": '{"ok": true, "reason": "Hợp lệ"}'}}]})

    provider = _provider(urlopen)
    provider.complete_json([LLMMessage(role="system", content="Bạn là trợ lý"), LLMMessage(role="user", content="hi")], SAMPLE_SCHEMA)

    schema_text = json.dumps(SAMPLE_SCHEMA, ensure_ascii=False, sort_keys=True)
    system_texts = [m["content"] for m in captured["body"]["messages"] if m["role"] == "system"]
    assert any(schema_text in text for text in system_texts)


def test_ollama_provider_retries_once_after_two_seconds_on_connection_reset_then_fails_as_provider_error():
    sleeps = []
    calls = []

    def reset(req, timeout):
        del req, timeout
        calls.append(1)
        raise ConnectionResetError("reset by peer")

    provider = _provider(reset, sleep_fn=sleeps.append)
    with pytest.raises(ProviderError):
        provider.complete_json([LLMMessage(role="user", content="hi")], SAMPLE_SCHEMA)
    assert len(calls) == 2
    assert sleeps == [2.0]


def test_ollama_provider_turns_token_failure_into_provider_error():
    def failing_token():
        raise RuntimeError("Keycloak token response missing access_token")

    provider = OllamaProvider(
        gateway_url="http://apisix:9081",
        token_provider=failing_token,
        sleep_fn=lambda _: None,
        urlopen_fn=lambda req, timeout: pytest.fail("no request without a token"),
    )
    with pytest.raises(ProviderError):
        provider.complete_json([LLMMessage(role="user", content="hi")], SAMPLE_SCHEMA)


def test_ollama_provider_rejects_malformed_gateway_output_as_provider_error():
    provider = _provider(lambda req, timeout: _FakeHTTPResponse({"choices": []}))
    with pytest.raises(ProviderError):
        provider.complete_json([LLMMessage(role="user", content="hi")], SAMPLE_SCHEMA)
