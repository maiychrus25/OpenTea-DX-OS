# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Ollama local LLM adapter calling the agent-dedicated APISIX route."""
import time
from typing import Any, Callable, Mapping, Sequence
import urllib.request

from .base import LLMMessage, LLMResponse, ProviderError, schema_message
from .http import JsonHttpProvider, _default_urlopen

DEFAULT_AGENT_LLM_PATH = "/api/internal/agent/llm/v1/chat/completions"


class OllamaProvider(JsonHttpProvider):
    """Calls Ollama through the APISIX internal agent route; HTTP 429 opens a cool-down instead of sleeping."""

    name = "ollama"
    label = "Ollama gateway"

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
        super().__init__(timeout_seconds=timeout_seconds, sleep_fn=sleep_fn, urlopen_fn=urlopen_fn, clock=clock)
        self.gateway_url = gateway_url.rstrip("/")
        self.endpoint_path = endpoint_path
        self._token_provider = token_provider
        self.model = model

    def _generate(self, messages: Sequence[LLMMessage], schema: Mapping[str, Any]) -> LLMResponse:
        data = self._post_json(
            f"{self.gateway_url}{self.endpoint_path}",
            {
                "model": self.model,
                "messages": [{"role": msg.role, "content": msg.content} for msg in [schema_message(schema), *messages]],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            headers=lambda: {"Authorization": f"Bearer {self._token_provider()}"},
        )

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
