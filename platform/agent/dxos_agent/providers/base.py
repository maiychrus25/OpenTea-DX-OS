# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Common LLM provider interface, schema validation, and single-retry loop."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
import json
from typing import Any, Mapping, Sequence

from ..evidence import canonical_json, sha256_hex


class ProviderError(Exception):
    """Base error raised when an LLM provider fails."""


class SchemaValidationError(ProviderError):
    """Raised when provider output fails JSON parsing or schema constraints."""


class RateLimitError(ProviderError):
    """Raised when the LLM gateway continues returning HTTP 429 after waiting."""

    def __init__(self, message: str, retry_after_seconds: float = 60.0) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


@dataclass(frozen=True)
class LLMMessage:
    """Single chat message sent to a provider."""

    role: str
    content: str


@dataclass(frozen=True)
class LLMResponse:
    """Raw completion response returned by a concrete provider adapter."""

    raw_text: str
    model: str = ""
    tokens_in: int = 0
    tokens_out: int = 0


@dataclass(frozen=True)
class LLMResult:
    """Schema-validated JSON completion result."""

    data: dict[str, Any]
    provider: str
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    input_hash: str = ""


def compute_input_hash(messages: Sequence[LLMMessage], schema: Mapping[str, Any]) -> str:
    """Compute a deterministic hash identifying prompt messages plus output JSON schema."""
    payload = {
        "messages": [{"role": msg.role, "content": msg.content} for msg in messages],
        "schema": dict(schema),
    }
    return sha256_hex(canonical_json(payload))


def _check_value(value: Any, schema: Mapping[str, Any], path: str) -> None:
    expected_type = schema.get("type")
    if expected_type == "object":
        if not isinstance(value, dict):
            raise SchemaValidationError(f"{path}: expected object")
        for req_key in schema.get("required", ()):
            if req_key not in value:
                raise SchemaValidationError(f"{path}.{req_key}: missing required field")
        props = schema.get("properties") or {}
        additional = schema.get("additionalProperties", True)
        for key, item in value.items():
            if key in props:
                _check_value(item, props[key], f"{path}.{key}")
            elif additional is False:
                raise SchemaValidationError(f"{path}.{key}: unexpected property")
            elif isinstance(additional, Mapping):
                _check_value(item, additional, f"{path}.{key}")
    elif expected_type == "array":
        if not isinstance(value, list):
            raise SchemaValidationError(f"{path}: expected array")
        item_schema = schema.get("items")
        if isinstance(item_schema, Mapping):
            for idx, elem in enumerate(value):
                _check_value(elem, item_schema, f"{path}[{idx}]")
    elif expected_type == "string":
        if not isinstance(value, str):
            raise SchemaValidationError(f"{path}: expected string")
        min_len = schema.get("minLength")
        max_len = schema.get("maxLength")
        if min_len is not None and len(value) < int(min_len):
            raise SchemaValidationError(f"{path}: shorter than minLength {min_len}")
        if max_len is not None and len(value) > int(max_len):
            raise SchemaValidationError(f"{path}: longer than maxLength {max_len}")
    elif expected_type == "integer":
        if isinstance(value, bool) or not isinstance(value, int):
            raise SchemaValidationError(f"{path}: expected integer")
    elif expected_type == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise SchemaValidationError(f"{path}: expected number")
    elif expected_type == "boolean":
        if not isinstance(value, bool):
            raise SchemaValidationError(f"{path}: expected boolean")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        if minimum is not None and value < float(minimum):
            raise SchemaValidationError(f"{path}: less than minimum {minimum}")
        if maximum is not None and value > float(maximum):
            raise SchemaValidationError(f"{path}: greater than maximum {maximum}")

    if "enum" in schema and value not in schema["enum"]:
        raise SchemaValidationError(f"{path}: value {value!r} not in enum {schema['enum']!r}")


def validate_json_schema(data: Any, schema: Mapping[str, Any], path: str = "$") -> dict[str, Any]:
    """Validate decoded JSON *data* against a JSON schema object."""
    if not isinstance(data, dict):
        raise SchemaValidationError(f"{path}: root output must be a JSON object")
    _check_value(data, schema, path)
    return data


def _strip_code_fence(raw_text: str) -> str:
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def parse_and_validate(raw_text: str, schema: Mapping[str, Any]) -> dict[str, Any]:
    """Decode JSON text (stripping optional markdown fences) and validate against *schema*."""
    cleaned = _strip_code_fence(raw_text)
    try:
        decoded = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise SchemaValidationError(f"Invalid JSON from provider: {exc}") from exc
    return validate_json_schema(decoded, schema)


class LLMProvider(ABC):
    """Base adapter that guarantees schema-checked JSON output with one retry."""

    name: str
    model: str

    def complete_json(self, messages: Sequence[LLMMessage], schema: Mapping[str, Any]) -> LLMResult:
        """Request JSON conforming to *schema*, retrying once if validation fails."""
        prompt_messages = list(messages)
        input_hash = compute_input_hash(prompt_messages, schema)
        total_in = 0
        total_out = 0
        last_error: SchemaValidationError | None = None

        for attempt in range(2):
            response = self._generate(prompt_messages, schema)
            total_in += response.tokens_in
            total_out += response.tokens_out
            try:
                parsed = parse_and_validate(response.raw_text, schema)
                return LLMResult(
                    data=parsed,
                    provider=self.name,
                    model=response.model or self.model,
                    tokens_in=total_in,
                    tokens_out=total_out,
                    input_hash=input_hash,
                )
            except SchemaValidationError as exc:
                last_error = exc
                if attempt == 0:
                    prompt_messages = [
                        *prompt_messages,
                        LLMMessage(
                            role="user",
                            content=(
                                f"Đầu ra JSON chưa hợp lệ ({exc}). "
                                "Hãy trả lời lại bằng duy nhất một đối tượng JSON đúng schema."
                            ),
                        ),
                    ]

        assert last_error is not None
        raise last_error

    @abstractmethod
    def _generate(self, messages: Sequence[LLMMessage], schema: Mapping[str, Any]) -> LLMResponse:
        """Execute a single generation turn and return raw response text."""
