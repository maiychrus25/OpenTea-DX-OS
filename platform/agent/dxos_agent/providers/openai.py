# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""OpenAI Chat Completions adapter over plain HTTP (no SDK, see ADR 0004)."""
from typing import Any, Mapping, Sequence

from .base import LLMMessage, LLMResponse, ProviderError, schema_message
from .http import JsonHttpProvider
from .redaction import redact_messages

DEFAULT_BASE_URL = "https://api.openai.com"


class OpenAIProvider(JsonHttpProvider):
    """Sends redacted messages to `/v1/chat/completions`; the model comes from the cooperative, else `default_model`."""

    name = "openai"
    label = "OpenAI API"
    external = True

    def __init__(self, api_key: str, default_model: str, base_url: str = DEFAULT_BASE_URL, **transport: Any) -> None:
        super().__init__(**transport)
        self._api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model
        self.model = default_model

    def _generate(self, messages: Sequence[LLMMessage], schema: Mapping[str, Any]) -> LLMResponse:
        prompt = redact_messages([schema_message(schema), *messages])
        data = self._post_json(
            f"{self.base_url}/v1/chat/completions",
            {
                "model": self.model,
                "messages": [{"role": msg.role, "content": msg.content} for msg in prompt],
                "response_format": {"type": "json_object"},
            },
            headers=lambda: {"Authorization": f"Bearer {self._api_key}"},
        )

        try:
            content = data["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise ProviderError("OpenAI response missing message content")
            usage = data.get("usage") or {}
            return LLMResponse(
                raw_text=content,
                model=str(data.get("model") or self.model),
                tokens_in=int(usage.get("prompt_tokens") or 0),
                tokens_out=int(usage.get("completion_tokens") or 0),
            )
        except (AttributeError, IndexError, KeyError, TypeError, ValueError) as exc:
            raise ProviderError(f"OpenAI response malformed: {type(exc).__name__}") from exc
