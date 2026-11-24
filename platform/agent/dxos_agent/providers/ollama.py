# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Ollama local LLM adapter calling the agent-dedicated APISIX route."""
from http.client import HTTPException
import json
import time
from typing import Any, Callable, Mapping, Sequence
import urllib.error
import urllib.request

from .base import LLMMessage, LLMProvider, LLMResponse, ProviderError, RateLimitError

DEFAULT_AGENT_LLM_PATH = "/api/internal/agent/llm/v1/chat/completions"
MIN_RATE_LIMIT_WAIT_SECONDS = 60.0
RETRY_DELAY_SECONDS = 2.0
SCHEMA_INSTRUCTION = "Chỉ trả lời bằng một đối tượng JSON đúng schema sau, không thêm trường nào khác:"


def _default_urlopen(req: urllib.request.Request, timeout: float) -> Any:
    return urllib.request.urlopen(req, timeout=timeout)


class OllamaProvider(LLMProvider):
    """Calls Ollama through the APISIX internal agent route; HTTP 429 opens a cool-down instead of sleeping."""

    name = "ollama"

    def __init__(
        self,
        gateway_url: str,
        token_provider: Callable[[], str],
        model: str = "qwen2.5:0.5b",
        endpoint_path: str = DEFAULT_AGENT_LLM_PATH,
        timeout_seconds: float = 60.0,
        sleep_fn: Callable[[float], None] = time.sleep,
        urlopen_fn: Callable[[urllib.request.Request, float], Any] = _default_urlopen,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.gateway_url = gateway_url.rstrip("/")
        self.endpoint_path = endpoint_path
        self._token_provider = token_provider
        self.model = model
        self.timeout_seconds = timeout_seconds
        self._sleep = sleep_fn
        self._urlopen = urlopen_fn
        self._clock = clock
        # Monotonic time before which no request is sent after an HTTP 429.
        self.next_allowed_at = 0.0

    def _post_completion(self, messages: Sequence[LLMMessage]) -> dict[str, Any]:
        url = f"{self.gateway_url}{self.endpoint_path}"
        body = json.dumps(
            {
                "model": self.model,
                "messages": [{"role": msg.role, "content": msg.content} for msg in messages],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._token_provider()}",
            },
        )
        with self._urlopen(req, self.timeout_seconds) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _post_with_retry(self, messages: Sequence[LLMMessage]) -> dict[str, Any]:
        error: ProviderError | None = None
        for attempt in range(2):
            try:
                return self._post_completion(messages)
            except urllib.error.HTTPError as exc:
                if exc.code == 429:
                    retry_header = exc.headers.get("Retry-After") if exc.headers else None
                    try:
                        parsed_retry = float(retry_header) if retry_header else 0.0
                    except ValueError:
                        parsed_retry = 0.0
                    wait_seconds = max(parsed_retry, MIN_RATE_LIMIT_WAIT_SECONDS)
                    self.next_allowed_at = self._clock() + wait_seconds
                    raise RateLimitError("LLM gateway returned HTTP 429", retry_after_seconds=wait_seconds) from exc
                error = ProviderError(f"Ollama gateway HTTP {exc.code}")
            except (OSError, HTTPException, ValueError, RuntimeError) as exc:
                # Covers transport errors, malformed JSON and token-client failures; only the class name is kept.
                error = ProviderError(f"Ollama gateway request failed: {type(exc).__name__}")
            if attempt == 0:
                self._sleep(RETRY_DELAY_SECONDS)
        assert error is not None
        raise error

    def _generate(self, messages: Sequence[LLMMessage], schema: Mapping[str, Any]) -> LLMResponse:
        remaining = self.next_allowed_at - self._clock()
        if remaining > 0:
            raise RateLimitError("LLM gateway rate limit still in effect", retry_after_seconds=remaining)

        schema_message = LLMMessage(
            role="system",
            content=f"{SCHEMA_INSTRUCTION}\n{json.dumps(schema, ensure_ascii=False, sort_keys=True)}",
        )
        data = self._post_with_retry([schema_message, *messages])

        try:
            choices = data.get("choices") or []
            if not choices or not isinstance(choices[0], dict):
                raise ProviderError("Ollama response missing choices")
            content = (choices[0].get("message") or {}).get("content")
            if not isinstance(content, str):
                raise ProviderError("Ollama response missing message content")
            usage = data.get("usage") or {}
            return LLMResponse(
                raw_text=content,
                model=str(data.get("model") or self.model),
                tokens_in=int(usage.get("prompt_tokens") or 0),
                tokens_out=int(usage.get("completion_tokens") or 0),
            )
        except (AttributeError, TypeError, ValueError) as exc:
            raise ProviderError(f"Ollama response malformed: {type(exc).__name__}") from exc
