# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Ollama local LLM adapter calling the agent-dedicated APISIX route."""
import json
import time
from typing import Any, Callable, Mapping, Sequence
import urllib.error
import urllib.request

from .base import LLMMessage, LLMProvider, LLMResponse, ProviderError, RateLimitError

DEFAULT_AGENT_LLM_PATH = "/api/internal/agent/llm/v1/chat/completions"
MIN_RATE_LIMIT_WAIT_SECONDS = 60.0


def _default_urlopen(req: urllib.request.Request, timeout: float) -> Any:
    return urllib.request.urlopen(req, timeout=timeout)


class OllamaProvider(LLMProvider):
    """Calls Ollama through APISIX internal agent route with HTTP 429 backoff (>= 60s)."""

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
    ) -> None:
        self.gateway_url = gateway_url.rstrip("/")
        self.endpoint_path = endpoint_path
        self._token_provider = token_provider
        self.model = model
        self.timeout_seconds = timeout_seconds
        self._sleep = sleep_fn
        self._urlopen = urlopen_fn

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

    def _generate(self, messages: Sequence[LLMMessage], schema: Mapping[str, Any]) -> LLMResponse:
        del schema  # JSON mode requested cleanly via response_format + prompt schema text.
        data: dict[str, Any] | None = None
        for attempt in range(2):
            try:
                data = self._post_completion(messages)
                break
            except urllib.error.HTTPError as exc:
                if exc.code == 429:
                    retry_header = exc.headers.get("Retry-After") if exc.headers else None
                    try:
                        parsed_retry = float(retry_header) if retry_header else 0.0
                    except ValueError:
                        parsed_retry = 0.0
                    wait_seconds = max(parsed_retry, MIN_RATE_LIMIT_WAIT_SECONDS)
                    if attempt == 0:
                        self._sleep(wait_seconds)
                        continue
                    raise RateLimitError("LLM gateway returned HTTP 429", retry_after_seconds=wait_seconds) from exc
                detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
                raise ProviderError(f"Ollama gateway HTTP {exc.code}: {detail}") from exc
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                raise ProviderError(f"Ollama gateway request failed: {exc}") from exc

        assert data is not None
        choices = data.get("choices") or []
        if not choices or not isinstance(choices[0], dict):
            raise ProviderError("Ollama response missing choices")
        content = ((choices[0].get("message") or {}).get("content"))
        if not isinstance(content, str):
            raise ProviderError("Ollama response missing message content")
        usage = data.get("usage") or {}
        return LLMResponse(
            raw_text=content,
            model=str(data.get("model") or self.model),
            tokens_in=int(usage.get("prompt_tokens") or 0),
            tokens_out=int(usage.get("completion_tokens") or 0),
        )
