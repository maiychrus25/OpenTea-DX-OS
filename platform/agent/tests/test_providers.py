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


def test_ollama_provider_waits_at_least_60s_on_http_429_and_succeeds_on_retry():
    calls = []
    sleeps = []

    def fake_urlopen(req, timeout):
        calls.append((req.full_url, req.get_header("Authorization"), timeout))
        if len(calls) == 1:
            hdrs = email.message.Message()
            hdrs["Retry-After"] = "15"
            raise urllib.error.HTTPError(
                req.full_url,
                429,
                "Too Many Requests",
                hdrs,
                io.BytesIO(b"rate limited"),
            )
        return _FakeHTTPResponse(
            {
                "model": "qwen2.5:0.5b",
                "choices": [{"message": {"content": '{"ok": true, "reason": "Sau 60s"}'}}],
                "usage": {"prompt_tokens": 11, "completion_tokens": 7},
            }
        )

    provider = OllamaProvider(
        gateway_url="http://apisix:9081",
        token_provider=lambda: "agent-jwt",
        model="qwen2.5:0.5b",
        sleep_fn=sleeps.append,
        urlopen_fn=fake_urlopen,
    )

    result = provider.complete_json([LLMMessage(role="user", content="hi")], SAMPLE_SCHEMA)
    assert result.data == {"ok": True, "reason": "Sau 60s"}
    assert result.tokens_in == 11
    assert result.tokens_out == 7
    assert len(sleeps) == 1
    assert sleeps[0] >= 60.0
    assert calls[0][0] == "http://apisix:9081/api/internal/agent/llm/v1/chat/completions"
    assert calls[0][1] == "Bearer agent-jwt"


def test_ollama_provider_raises_rate_limit_error_when_429_persists():
    sleeps = []

    def always_429(req, timeout):
        del timeout
        raise urllib.error.HTTPError(req.full_url, 429, "Too Many Requests", email.message.Message(), io.BytesIO(b""))

    provider = OllamaProvider(
        gateway_url="http://apisix:9081",
        token_provider=lambda: "agent-jwt",
        sleep_fn=sleeps.append,
        urlopen_fn=always_429,
    )
    with pytest.raises(RateLimitError) as exc_info:
        provider.complete_json([LLMMessage(role="user", content="hi")], SAMPLE_SCHEMA)
    assert sleeps == [60.0]
    assert exc_info.value.retry_after_seconds >= 60.0
