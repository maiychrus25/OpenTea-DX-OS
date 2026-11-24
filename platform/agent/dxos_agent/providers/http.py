# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""JSON-over-HTTP transport shared by the LLM adapters: one retry, HTTP 429 cool-down, request count."""
from http.client import HTTPException
import json
import time
from typing import Any, Callable, Mapping
import urllib.error
import urllib.request

from .base import LLMProvider, ProviderError, RateLimitError

MIN_RATE_LIMIT_WAIT_SECONDS = 60.0
RETRY_DELAY_SECONDS = 2.0


def _default_urlopen(req: urllib.request.Request, timeout: float) -> Any:
    return urllib.request.urlopen(req, timeout=timeout)


class JsonHttpProvider(LLMProvider):
    """Base for adapters that POST JSON. Errors name only `label` and the exception class, never a key or a body."""

    label = "LLM"

    def __init__(
        self,
        timeout_seconds: float = 60.0,
        sleep_fn: Callable[[float], None] = time.sleep,
        urlopen_fn: Callable[[urllib.request.Request, float], Any] = _default_urlopen,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self._sleep = sleep_fn
        self._urlopen = urlopen_fn
        self._clock = clock
        # Monotonic time before which no request is sent after an HTTP 429.
        self.next_allowed_at = 0.0
        # Requests sent, retries included; a run's external_calls is the delta of this counter.
        self.requests_sent = 0

    def _post_json(
        self,
        url: str,
        body: Mapping[str, Any],
        headers: Callable[[], Mapping[str, str]],
    ) -> dict[str, Any]:
        remaining = self.next_allowed_at - self._clock()
        if remaining > 0:
            raise RateLimitError(f"{self.label} rate limit still in effect", retry_after_seconds=remaining)

        error: ProviderError | None = None
        for attempt in range(2):
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(body).encode("utf-8"),
                    method="POST",
                    headers={"Content-Type": "application/json", **headers()},
                )
                self.requests_sent += 1
                with self._urlopen(req, self.timeout_seconds) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                # Close the error response: its socket is otherwise left open until garbage collection.
                exc.close()
                if exc.code == 429:
                    retry_header = exc.headers.get("Retry-After") if exc.headers else None
                    try:
                        parsed_retry = float(retry_header) if retry_header else 0.0
                    except ValueError:
                        parsed_retry = 0.0
                    wait_seconds = max(parsed_retry, MIN_RATE_LIMIT_WAIT_SECONDS)
                    self.next_allowed_at = self._clock() + wait_seconds
                    raise RateLimitError(f"{self.label} returned HTTP 429", retry_after_seconds=wait_seconds) from exc
                error = ProviderError(f"{self.label} HTTP {exc.code}")
            except (OSError, HTTPException, ValueError, RuntimeError) as exc:
                # Covers transport errors, malformed JSON and token-client failures; only the class name is kept.
                error = ProviderError(f"{self.label} request failed: {type(exc).__name__}")
            if attempt == 0:
                self._sleep(RETRY_DELAY_SECONDS)
        assert error is not None
        raise error
