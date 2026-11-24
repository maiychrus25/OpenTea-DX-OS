# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Deterministic replay LLM provider for CI tests and offline demonstrations."""
import json
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from .base import LLMMessage, LLMProvider, LLMResponse, ProviderError, compute_input_hash


def _to_raw_text(payload: Any) -> str:
    if isinstance(payload, Exception):
        raise payload
    if isinstance(payload, str):
        return payload
    return json.dumps(payload, ensure_ascii=False)


class ReplayProvider(LLMProvider):
    """Returns pre-recorded JSON completions keyed by input_hash, entry key, or resolver."""

    name = "replay"

    def __init__(
        self,
        fixtures: Mapping[str, Any] | None = None,
        replay_dir: Path | None = None,
        resolver: Callable[[Sequence[LLMMessage], Mapping[str, Any], str], Any] | None = None,
        model: str = "replay-v1",
    ) -> None:
        self.model = model
        self._resolver = resolver
        self._fixtures: dict[str, Any] = dict(fixtures or {})
        self._attempt_index: dict[str, int] = {}
        if replay_dir is not None and replay_dir.exists():
            self._load_directory(replay_dir)

    def _load_directory(self, replay_dir: Path) -> None:
        for path in sorted(replay_dir.glob("*.json")):
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                if isinstance(loaded.get("responses"), dict):
                    self._fixtures.update(loaded["responses"])
                else:
                    for key, value in loaded.items():
                        self._fixtures[key] = value
            elif isinstance(loaded, list):
                for item in loaded:
                    if isinstance(item, dict) and "input_hash" in item and "response" in item:
                        self._fixtures[str(item["input_hash"])] = item["response"]

    def _lookup_sequence_or_value(self, key: str) -> Any:
        entry = self._fixtures[key]
        if isinstance(entry, list) and entry:
            idx = self._attempt_index.get(key, 0)
            self._attempt_index[key] = min(idx + 1, len(entry) - 1)
            return entry[idx]
        return entry

    def _generate(self, messages: Sequence[LLMMessage], schema: Mapping[str, Any]) -> LLMResponse:
        base_messages = messages[:-1] if len(messages) >= 2 and messages[-1].content.startswith("Đầu ra JSON chưa hợp lệ") else messages
        base_hash = compute_input_hash(base_messages, schema)

        if self._resolver is not None:
            resolved = self._resolver(messages, schema, base_hash)
            return LLMResponse(raw_text=_to_raw_text(resolved), model=self.model)

        if base_hash in self._fixtures:
            return LLMResponse(raw_text=_to_raw_text(self._lookup_sequence_or_value(base_hash)), model=self.model)

        # Fallback match: allow scenario files to key responses by record id mentioned in prompts or "default".
        combined = "\n".join(msg.content for msg in base_messages)
        for key in self._fixtures:
            if key != "default" and key in combined:
                return LLMResponse(raw_text=_to_raw_text(self._lookup_sequence_or_value(key)), model=self.model)

        if "default" in self._fixtures:
            return LLMResponse(raw_text=_to_raw_text(self._lookup_sequence_or_value("default")), model=self.model)

        raise ProviderError(f"No replay fixture matched input_hash={base_hash}")
