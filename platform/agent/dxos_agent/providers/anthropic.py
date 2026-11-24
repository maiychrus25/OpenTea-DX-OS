# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Anthropic Messages API adapter over plain HTTP (no SDK, see ADR 0004)."""
from typing import Any, Mapping, Sequence

from .base import LLMMessage, LLMResponse, ProviderError, schema_message
from .http import JsonHttpProvider
from .redaction import redact_messages

DEFAULT_BASE_URL = "https://api.anthropic.com"
API_VERSION = "2026-10-21"
# Current models think before answering by default and the thinking counts toward this cap.
MAX_TOKENS = 8192


class AnthropicProvider(JsonHttpProvider):
    """Sends redacted messages to `/v1/messages`; the model comes from the cooperative, else `default_model`."""

    name = "anthropic"
    label = "Anthropic API"
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
            f"{self.base_url}/v1/messages",
            {
                "model": self.model,
                "max_tokens": MAX_TOKENS,
                "system": "\n\n".join(msg.content for msg in prompt if msg.role == "system"),
                "messages": [{"role": msg.role, "content": msg.content} for msg in prompt if msg.role != "system"],
            },
            headers=lambda: {"x-api-key": self._api_key, "anthropic-version": API_VERSION},
        )

        if data.get("stop_reason") == "refusal":
            raise ProviderError("Anthropic declined the request")
        try:
            # A response can start with thinking blocks: the answer is the first text block.
            text = next(block["text"] for block in data["content"] if block.get("type") == "text")
            if not isinstance(text, str):
                raise ProviderError("Anthropic response missing text")
            usage = data.get("usage") or {}
            return LLMResponse(
                raw_text=text,
                model=str(data.get("model") or self.model),
                tokens_in=int(usage.get("input_tokens") or 0),
                tokens_out=int(usage.get("output_tokens") or 0),
            )
        except (AttributeError, KeyError, StopIteration, TypeError, ValueError) as exc:
            raise ProviderError(f"Anthropic response malformed: {type(exc).__name__}") from exc
