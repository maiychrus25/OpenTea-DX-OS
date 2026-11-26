# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Telegram Bot API calls for the relay. Errors say whether the message can be retried."""
import json
import urllib.error
import urllib.request
from typing import Any, Callable, Mapping, Optional


class BotApiError(Exception):
    """A failed Bot API call. `permanent` means this message can never be delivered (blocked chat, wrong chat id)."""

    def __init__(
        self,
        description: str,
        *,
        code: int = 0,
        retry_after: Optional[int] = None,
        permanent: bool = False,
    ) -> None:
        super().__init__(description)
        self.description = description
        self.code = code
        self.retry_after = retry_after
        self.permanent = permanent


class BotApi:
    """Calls `<api_base>/bot<token>/<method>`. The token is never put in an error message."""

    def __init__(
        self,
        api_base: str,
        token: str,
        urlopen_fn: Callable[..., Any] = urllib.request.urlopen,
    ) -> None:
        self._base = f"{api_base.rstrip('/')}/bot{token}"
        self._file_base = f"{api_base.rstrip('/')}/file/bot{token}"
        self._urlopen = urlopen_fn

    def call(self, method: str, params: Mapping[str, Any] | None = None, timeout: float = 15.0) -> Any:
        req = urllib.request.Request(
            f"{self._base}/{method}",
            data=json.dumps(dict(params or {})).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with self._urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            payload = _error_body(exc)
            retry_after = (payload.get("parameters") or {}).get("retry_after")
            description = str(payload.get("description") or f"HTTP {exc.code}")
            # 400 and 403 are about this chat (blocked, unknown, not modified); 401, 409 and 429 are not about the message.
            permanent = exc.code in (400, 403) and retry_after is None
            raise BotApiError(
                description,
                code=exc.code,
                retry_after=int(retry_after) if retry_after is not None else None,
                permanent=permanent,
            ) from None
        except (urllib.error.URLError, OSError) as exc:
            raise BotApiError(f"network error: {type(exc).__name__}") from None
        if not payload.get("ok"):
            raise BotApiError(str(payload.get("description") or "Bot API returned ok=false"))
        return payload.get("result")

    def download(self, file_path: str, timeout: float = 15.0) -> bytes:
        """Fetches a file that getFile named: `<api_base>/file/bot<token>/<file_path>`. Errors never show the URL."""
        req = urllib.request.Request(f"{self._file_base}/{file_path}", method="GET")
        try:
            with self._urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            code = exc.code
            exc.close()  # CI runs the tests with -W error: an unclosed HTTP error response warns when collected
            raise BotApiError(f"file download answered HTTP {code}", code=code) from None
        except (urllib.error.URLError, OSError) as exc:
            raise BotApiError(f"network error: {type(exc).__name__}") from None


def _error_body(exc: urllib.error.HTTPError) -> dict[str, Any]:
    try:
        body = json.loads(exc.read().decode("utf-8"))
    except (OSError, ValueError):
        return {}
    finally:
        exc.close()  # CI runs the tests with -W error: an unclosed HTTP error response warns when collected
    return body if isinstance(body, dict) else {}
