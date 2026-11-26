# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Speech-to-text client for the voice path (M15): posts audio held in memory to the cooperative's own whisper.cpp server."""
import ipaddress
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any, Callable

STT_TIMEOUT_SECONDS = 30.0
TEXT_MAX_CHARS = 500
LOCAL_HOSTS = ("dxos-stt", "localhost")
# whisper.cpp writes markers such as [BLANK_AUDIO] or (music) for silence and noise; they are not speech.
_NOISE_MARKER = re.compile(r"^[\[(][^\])]*[\])]$")


class SttError(Exception):
    """The STT server is unreachable, slow or answered something unusable, or the configured URL is not allowed."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """The audio goes to the configured host and nowhere else, so a redirect is an error."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


def validate_stt_url(url: str) -> str:
    """Audio never leaves the server: only `dxos-stt`, `localhost` or a private or loopback address is allowed."""
    parts = urllib.parse.urlsplit(url or "")
    host = parts.hostname
    if parts.scheme != "http" or not host or parts.username or parts.password:
        raise SttError("DXOS_STT_URL must be an http URL of a host on the compose network")
    if host not in LOCAL_HOSTS:
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            raise SttError("DXOS_STT_URL must name dxos-stt, localhost or a private address") from None
        if not (address.is_private or address.is_loopback):
            raise SttError("DXOS_STT_URL must name dxos-stt, localhost or a private address")
    return url.rstrip("/")


class SttClient:
    def __init__(self, url: str, urlopen_fn: Callable[..., Any] | None = None) -> None:
        self._url = validate_stt_url(url)
        self._urlopen = urlopen_fn or urllib.request.build_opener(NoRedirect).open

    def transcribe(self, audio: bytes) -> str:
        """The recognised text, trimmed and cut to 500 characters; empty for silence. The bytes are not kept."""
        boundary = uuid.uuid4().hex
        body = _multipart(boundary, audio)
        req = urllib.request.Request(
            f"{self._url}/inference", data=body, method="POST", headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
        )
        try:
            with self._urlopen(req, timeout=STT_TIMEOUT_SECONDS) as resp:
                text = json.loads(resp.read().decode("utf-8")).get("text")
        except urllib.error.HTTPError as exc:
            exc.close()  # CI runs the tests with -W error: an unclosed HTTP error response warns when collected
            raise SttError(f"STT answered HTTP {exc.code}") from None
        except (urllib.error.URLError, OSError, ValueError, AttributeError) as exc:
            raise SttError(f"STT failed: {type(exc).__name__}") from None
        if not isinstance(text, str):
            raise SttError("STT answer has no text")
        text = text.strip()
        return "" if _NOISE_MARKER.match(text) else text[:TEXT_MAX_CHARS]


def _multipart(boundary: str, audio: bytes) -> bytes:
    fields = {"response_format": "json", "language": "vi"}
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode("ascii") for key, value in fields.items()]
    head = f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice.ogg"\r\nContent-Type: audio/ogg\r\n\r\n'
    return b"".join(parts) + head.encode("ascii") + audio + f"\r\n--{boundary}--\r\n".encode("ascii")
