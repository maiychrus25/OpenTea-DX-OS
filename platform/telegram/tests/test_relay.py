# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Relay behaviour with a fake Bot API and a fake web: updates, replies, outbox results, retries."""
import base64

import pytest

from dxos_telegram.bot_api import BotApiError
from dxos_telegram.gateway import GatewayError
from dxos_telegram.relay import Relay, forwardable_update, message_call


class FakeBot:
    def __init__(self, fail_on=None, files=None):
        self.calls = []
        self.fail_on = fail_on or {}
        self.files = files or {}

    def call(self, method, params=None, timeout=15.0):
        self.calls.append((method, dict(params or {})))
        if method in self.fail_on:
            raise self.fail_on[method]
        if method == "sendMessage":
            return {"message_id": 900 + len(self.calls)}
        if method == "getFile":
            return {"file_id": params["file_id"], "file_path": f"photos/{params['file_id']}.jpg"}
        return True

    def download(self, file_path, timeout=15.0):
        if "download" in self.fail_on:
            raise self.fail_on["download"]
        return self.files[file_path]


class FakeWeb:
    def __init__(self, reply=None, refuse=False):
        self.reply = reply or {}
        self.refuse = refuse
        self.forwarded = []
        self.results = []

    def forward_update(self, update):
        if self.refuse:
            raise GatewayError("down")
        self.forwarded.append(update)
        return self.reply

    def report_result(self, item_id, result):
        self.results.append((item_id, result))


def make_relay(bot=None, web=None):
    return Relay(bot or FakeBot(), web or FakeWeb(), version="test")


def test_forwardable_update_drops_fields_the_web_does_not_read():
    update = {
        "update_id": 9,
        "message": {
            "message_id": 1, "date": 1, "text": "/start ABC",
            "chat": {"id": 5, "type": "private", "first_name": "Lan"},
            "from": {"id": 5, "is_bot": False, "first_name": "Lan", "username": "lan"},
        },
    }
    assert forwardable_update(update) == {
        "update_id": 9,
        "message": {"message_id": 1, "text": "/start ABC", "chat": {"id": 5, "type": "private"}, "from": {"id": 5}},
    }


def test_callback_keeps_id_data_and_message_reference():
    update = {
        "update_id": 3,
        "callback_query": {
            "id": "cq1", "from": {"id": 5, "first_name": "Lan"}, "data": "v1|x|a|y",
            "message": {"message_id": 44, "chat": {"id": 5, "type": "private"}, "text": "proposal"},
        },
    }
    assert forwardable_update(update)["callback_query"] == {
        "id": "cq1", "from": {"id": 5}, "data": "v1|x|a|y",
        "message": {"message_id": 44, "chat": {"id": 5, "type": "private"}},
    }


def test_send_and_edit_map_to_bot_methods():
    send = {"op": "send", "chat_id": 5, "text": "t", "buttons": [[{"text": "Duyệt", "callback_data": "d"}]]}
    assert message_call(send) == ("sendMessage", {"chat_id": 5, "text": "t", "reply_markup": {"inline_keyboard": [[{"text": "Duyệt", "callback_data": "d"}]]}})
    edit = {"op": "edit", "chat_id": 5, "text": "done", "edit_message_id": 44}
    assert message_call(edit) == ("editMessageText", {"chat_id": 5, "message_id": 44, "text": "done", "reply_markup": {"inline_keyboard": []}})


def test_update_is_forwarded_then_callback_answered_before_replies():
    web = FakeWeb(reply={
        "answer_callback": {"text": "Đã ghi nhận", "show_alert": False},
        "replies": [{"op": "send", "chat_id": 5, "text": "Xin chào"}],
    })
    bot = FakeBot()
    relay = make_relay(bot, web)
    update = {"update_id": 1, "callback_query": {"id": "cq1", "from": {"id": 5}, "message": {"message_id": 4, "chat": {"id": 5, "type": "private"}}, "data": "v1"}}
    assert relay.process_update(update) is True
    assert [c[0] for c in bot.calls] == ["answerCallbackQuery", "sendMessage"]
    assert bot.calls[0][1]["callback_query_id"] == "cq1"


def test_web_refusal_keeps_the_update_for_a_later_try():
    bot = FakeBot()
    relay = make_relay(bot, FakeWeb(refuse=True))
    assert relay.process_update({"update_id": 1, "message": {"message_id": 1, "chat": {"id": 5, "type": "private"}, "text": "x"}}) is False
    assert bot.calls == []


def test_malformed_update_is_acknowledged_and_dropped():
    assert make_relay().process_update({"update_id": 2, "message": {"message_id": 1}}) is True


def test_outbox_delivery_reports_the_telegram_message_id():
    web = FakeWeb()
    relay = make_relay(FakeBot(), web)
    assert relay.deliver([{"id": "o1", "op": "send", "chat_id": 5, "text": "t"}]) == 0.0
    assert web.results == [("o1", {"ok": True, "telegram_message_id": 901})]


def test_edit_reports_the_edited_message_id_and_accepts_not_modified():
    web = FakeWeb()
    relay = make_relay(FakeBot(fail_on={"editMessageText": BotApiError("Bad Request: message is not modified", code=400)}), web)
    relay.deliver([{"id": "o2", "op": "edit", "chat_id": 5, "text": "t", "edit_message_id": 44}])
    assert web.results == [("o2", {"ok": True, "telegram_message_id": 44})]


def test_rate_limit_is_reported_with_retry_after_and_stops_the_batch():
    web = FakeWeb()
    bot = FakeBot(fail_on={"sendMessage": BotApiError("Too Many Requests", code=429, retry_after=12)})
    relay = make_relay(bot, web)
    pause = relay.deliver([
        {"id": "o1", "op": "send", "chat_id": 5, "text": "a"},
        {"id": "o2", "op": "send", "chat_id": 6, "text": "b"},
    ])
    assert pause == 12.0
    assert web.results == [("o1", {"ok": False, "error": "Too Many Requests", "retry_after_seconds": 12})]
    assert len(bot.calls) == 1


def test_permanent_failure_is_reported_and_the_batch_goes_on():
    web = FakeWeb()
    bot = FakeBot(fail_on={"sendMessage": BotApiError("Forbidden: bot was blocked by the user", code=403, permanent=True)})
    relay = make_relay(bot, web)
    relay.deliver([{"id": "o1", "op": "send", "chat_id": 5, "text": "a"}])
    assert web.results == [("o1", {"ok": False, "error": "Forbidden: bot was blocked by the user", "permanent": True})]


def test_network_failure_reports_without_retry_after_and_backs_off():
    web = FakeWeb()
    relay = make_relay(FakeBot(fail_on={"sendMessage": BotApiError("network error: URLError")}), web)
    assert relay.deliver([{"id": "o1", "op": "send", "chat_id": 5, "text": "a"}]) == 5.0
    assert web.results == [("o1", {"ok": False, "error": "network error: URLError"})]


PHOTO_UPDATE = {
    "update_id": 5,
    "message": {
        "message_id": 2, "chat": {"id": 5, "type": "private"}, "from": {"id": 5}, "caption": "ghi nhật ký",
        "photo": [
            {"file_id": "small", "file_unique_id": "u-small", "file_size": 2048},
            {"file_id": "large", "file_unique_id": "u-large", "file_size": 4096},
        ],
    },
}


def test_photo_is_forwarded_as_bytes_with_its_caption_and_the_largest_size():
    web = FakeWeb()
    bot = FakeBot(files={"photos/large.jpg": b"JPEGDATA"})
    assert make_relay(bot, web).process_update(PHOTO_UPDATE) is True
    message = web.forwarded[0]["message"]
    assert message["caption"] == "ghi nhật ký"
    assert message["photo"] == {
        "mime_type": "image/jpeg", "data_base64": base64.b64encode(b"JPEGDATA").decode("ascii"), "file_unique_id": "u-large",
    }
    assert ("getFile", {"file_id": "large"}) in bot.calls


def test_oversized_photo_is_forwarded_as_photo_error_without_download():
    web = FakeWeb()
    bot = FakeBot()
    update = {"update_id": 6, "message": {"message_id": 3, "chat": {"id": 5, "type": "private"}, "from": {"id": 5},
              "photo": [{"file_id": "huge", "file_unique_id": "u", "file_size": 6 * 1024 * 1024}]}}
    make_relay(bot, web).process_update(update)
    assert web.forwarded[0]["message"]["photo_error"] == "too_large"
    assert "photo" not in web.forwarded[0]["message"]
    assert bot.calls == []


def test_photo_whose_bytes_exceed_5_mb_is_too_large_even_with_a_small_file_size():
    web = FakeWeb()
    bot = FakeBot(files={"photos/large.jpg": b"x" * (5 * 1024 * 1024 + 1)})
    make_relay(bot, web).process_update(PHOTO_UPDATE)
    assert web.forwarded[0]["message"]["photo_error"] == "too_large"


def test_failed_download_is_forwarded_as_download_failed():
    for fail_on in ({"getFile": BotApiError("Bad Request: wrong file_id", code=400, permanent=True)},
                    {"download": BotApiError("file download answered HTTP 404", code=404)}):
        web = FakeWeb()
        make_relay(FakeBot(fail_on=fail_on), web).process_update(PHOTO_UPDATE)
        assert web.forwarded[0]["message"]["photo_error"] == "download_failed"
        assert "photo" not in web.forwarded[0]["message"]


def test_location_is_forwarded_with_its_coordinates_and_nothing_else():
    update = {"update_id": 7, "message": {"message_id": 4, "chat": {"id": 5, "type": "private"}, "from": {"id": 5, "first_name": "Lan"},
              "location": {"latitude": 21.58, "longitude": 105.77, "horizontal_accuracy": 8}}}
    assert forwardable_update(update)["message"] == {
        "message_id": 4, "chat": {"id": 5, "type": "private"}, "from": {"id": 5}, "location": {"latitude": 21.58, "longitude": 105.77},
    }
