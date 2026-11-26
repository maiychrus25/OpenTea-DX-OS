# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Bot API client: request shape and which failures may be retried."""
import io
import json
import urllib.error

import pytest

from dxos_telegram.bot_api import BotApi, BotApiError


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def fake_urlopen(status=200, body=None, requests=None):
    def opener(req, timeout):
        if requests is not None:
            requests.append((req.full_url, json.loads(req.data.decode("utf-8")), timeout))
        data = json.dumps(body if body is not None else {"ok": True, "result": True}).encode("utf-8")
        if status == 200:
            return FakeResponse(data)
        raise urllib.error.HTTPError(req.full_url, status, "error", {}, io.BytesIO(data))

    return opener


def test_call_posts_json_to_the_method_url():
    seen = []
    api = BotApi("https://api.example.test/", "123:abc", urlopen_fn=fake_urlopen(body={"ok": True, "result": {"message_id": 7}}, requests=seen))
    assert api.call("sendMessage", {"chat_id": 5, "text": "hi"}) == {"message_id": 7}
    assert seen == [("https://api.example.test/bot123:abc/sendMessage", {"chat_id": 5, "text": "hi"}, 15.0)]


@pytest.mark.parametrize(
    ("status", "body", "retry_after", "permanent"),
    [
        (429, {"ok": False, "description": "Too Many Requests", "parameters": {"retry_after": 12}}, 12, False),
        (403, {"ok": False, "description": "Forbidden: bot was blocked by the user"}, None, True),
        (400, {"ok": False, "description": "Bad Request: chat not found"}, None, True),
        (401, {"ok": False, "description": "Unauthorized"}, None, False),
        (500, {"ok": False, "description": "Internal"}, None, False),
    ],
)
def test_http_errors_say_whether_retrying_can_help(status, body, retry_after, permanent):
    api = BotApi("https://api.example.test", "t", urlopen_fn=fake_urlopen(status=status, body=body))
    with pytest.raises(BotApiError) as info:
        api.call("sendMessage", {})
    assert info.value.retry_after == retry_after
    assert info.value.permanent is permanent
    assert "t" not in str(info.value).split()  # the token is never echoed


def test_network_failure_is_retryable_and_hides_the_url():
    def refuse(req, timeout):
        raise urllib.error.URLError("connection refused to https://api.example.test/bot123:SECRET")

    api = BotApi("https://api.example.test", "123:SECRET", urlopen_fn=refuse)
    with pytest.raises(BotApiError) as info:
        api.call("getUpdates", {})
    assert info.value.permanent is False
    assert "SECRET" not in str(info.value)


def test_download_reads_the_file_url_and_returns_the_bytes():
    seen = []

    def opener(req, timeout):
        seen.append(req.full_url)
        return FakeResponse(b"\xff\xd8\xff photo")

    api = BotApi("https://api.example.test/", "123:abc", urlopen_fn=opener)
    assert api.download("photos/file_1.jpg") == b"\xff\xd8\xff photo"
    assert seen == ["https://api.example.test/file/bot123:abc/photos/file_1.jpg"]


def test_download_failures_hide_the_url():
    def refuse(req, timeout):
        raise urllib.error.URLError("connection refused to https://api.example.test/file/bot123:SECRET/x.jpg")

    api = BotApi("https://api.example.test", "123:SECRET", urlopen_fn=refuse)
    with pytest.raises(BotApiError) as info:
        api.download("x.jpg")
    assert info.value.permanent is False
    assert "SECRET" not in str(info.value)


def test_download_http_error_carries_the_status_only():
    api = BotApi("https://api.example.test", "123:SECRET", urlopen_fn=fake_urlopen(status=404, body={"ok": False}))
    with pytest.raises(BotApiError) as info:
        api.download("gone.jpg")
    assert info.value.code == 404
    assert "SECRET" not in str(info.value)
