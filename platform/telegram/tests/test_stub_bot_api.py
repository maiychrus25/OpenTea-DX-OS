# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The Bot API stub serves getFile and the photo download that the relay's photo path needs (smoke only)."""
import json
import threading
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

from dxos_telegram.bot_api import BotApi
from dxos_telegram.stub_bot_api import StubState, make_handler


@pytest.fixture
def stub():
    state = StubState()
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(state))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()
    thread.join()


def test_get_file_names_a_path_the_stub_serves_as_a_jpeg(stub):
    api = BotApi(stub, "123:smoke")
    info = api.call("getFile", {"file_id": "smoke-photo-l"})
    assert info["file_path"] == "photos/smoke.jpg"
    data = api.download(info["file_path"])
    assert data[:3] == b"\xff\xd8\xff" and data[-2:] == b"\xff\xd9"
    assert len(data) < 5 * 1024 * 1024


def test_photo_update_injected_on_control_is_returned_by_get_updates(stub):
    update = {"update_id": 42, "message": {"message_id": 1, "chat": {"id": 5, "type": "private"}, "from": {"id": 5},
                                           "photo": [{"file_id": "smoke-photo-l", "file_unique_id": "u", "file_size": 4096}]}}
    req = urllib.request.Request(f"{stub}/control/updates", data=json.dumps(update).encode("utf-8"), method="POST")
    urllib.request.urlopen(req, timeout=5).read()
    assert BotApi(stub, "123:smoke").call("getUpdates", {"offset": 0, "timeout": 0}) == [update]


def test_stub_accepts_send_media_group_and_records_the_album(stub):
    api = BotApi(stub, "123:smoke")
    media = [{"type": "photo", "media": "attach://p0", "caption": "Xong"}, {"type": "photo", "media": "attach://p1"}]
    result = api.call_files("sendMediaGroup", {"chat_id": 5, "media": media},
                            {"p0": ("a.png", b"AAAA", "image/png"), "p1": ("b.png", b"BB", "image/png")})
    assert [m["message_id"] for m in result] == [1001, 1002]
    calls = json.loads(urllib.request.urlopen(f"{stub}/control/calls", timeout=5).read())
    assert calls == [{"method": "sendMediaGroup", "params": {"chat_id": 5, "media": media},
                      "files": [{"name": "p0", "filename": "a.png", "size": 4}, {"name": "p1", "filename": "b.png", "size": 2}]}]


def test_stub_accepts_send_photo(stub):
    api = BotApi(stub, "123:smoke")
    assert api.call_files("sendPhoto", {"chat_id": 5, "caption": "x"}, {"photo": ("a.png", b"A", "image/png")})["message_id"] == 1001


def test_stub_records_set_chat_menu_button(stub):
    params = {"menu_button": {"type": "web_app", "text": "Mở ứng dụng", "web_app": {"url": "https://x.example/telegram/open"}}}
    assert BotApi(stub, "123:smoke").call("setChatMenuButton", params) is True
    calls = json.loads(urllib.request.urlopen(f"{stub}/control/calls", timeout=5).read())
    assert calls == [{"method": "setChatMenuButton", "params": params}]
