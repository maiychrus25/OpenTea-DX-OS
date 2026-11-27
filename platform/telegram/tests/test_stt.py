# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Speech-to-text client and the relay's voice path (M15): the audio goes to the STT host only, in memory, and is dropped."""
import io
import json
import urllib.error

import pytest

from dxos_telegram import __main__ as telegram_main
from dxos_telegram.bot_api import BotApiError
from dxos_telegram.config import Config
from dxos_telegram.gateway import GatewayError
from dxos_telegram.relay import Relay
from dxos_telegram.stt import SttClient, SttError, validate_stt_url

AUDIO = b"OggS-voice-bytes-that-must-reach-only-the-stt-host"


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeStt:
    """Records every request; answers like whisper-server."""

    def __init__(self, text=" Ghi nhật ký bón phân thửa A3 ", fail=None):
        self.requests = []
        self.text = text
        self.fail = fail

    def __call__(self, req, timeout):
        self.requests.append((req.full_url, req.get_method(), dict(req.header_items()), req.data, timeout))
        if self.fail:
            raise self.fail
        return FakeResponse(json.dumps({"text": self.text}).encode("utf-8"))


class FakeBot:
    def __init__(self, data=AUDIO, fail_on=None):
        self.calls = []
        self.downloads = []
        self.data = data
        self.fail_on = fail_on or {}

    def call(self, method, params=None, timeout=15.0):
        self.calls.append((method, dict(params or {})))
        if method in self.fail_on:
            raise self.fail_on[method]
        if method == "getFile":
            return {"file_id": params["file_id"], "file_path": "voice/file_1.oga", "file_size": len(self.data)}
        return True

    def download(self, file_path, timeout=15.0, max_bytes=None):
        self.downloads.append((file_path, max_bytes))
        if "download" in self.fail_on:
            raise self.fail_on["download"]
        return self.data


class FakeWeb:
    def __init__(self):
        self.forwarded = []

    def forward_update(self, update):
        self.forwarded.append(json.loads(json.dumps(update)))  # what leaves the relay is what is JSON-encoded
        return {}

    def report_result(self, item_id, result):
        pass


def voice_update(duration=7, chat_type="private"):
    return {"update_id": 11, "message": {"message_id": 3, "chat": {"id": 5, "type": chat_type}, "from": {"id": 5},
            "voice": {"file_id": "v1", "file_unique_id": "u", "duration": duration, "mime_type": "audio/ogg", "file_size": len(AUDIO)}}}


def make(bot=None, stt=None, web=None):
    stt = stt or FakeStt()
    web = web or FakeWeb()
    client = SttClient("http://dxos-stt:8080", urlopen_fn=stt)
    return Relay(bot or FakeBot(), web, "test", stt=client), stt, web


def test_voice_is_downloaded_posted_to_stt_as_multipart_and_forwarded_as_text_only():
    bot = FakeBot()
    relay, stt, web = make(bot)
    assert relay.process_update(voice_update()) is True
    assert bot.downloads == [("voice/file_1.oga", 2 * 1024 * 1024)]
    ((url, method, headers, body, timeout),) = stt.requests
    assert (url, method, timeout) == ("http://dxos-stt:8080/inference", "POST", 30.0)
    assert headers["Content-type"].startswith("multipart/form-data; boundary=")
    assert AUDIO in body and b'name="file"' in body and b'name="response_format"' in body and b"json" in body and b'name="language"' in body
    message = web.forwarded[0]["message"]
    assert message["voice_text"] == "Ghi nhật ký bón phân thửa A3" and message["voice_duration"] == 7
    assert "voice" not in message and "voice_error" not in message
    assert AUDIO.decode("latin-1") not in json.dumps(web.forwarded)


def test_voice_longer_than_60_seconds_is_refused_without_a_download():
    bot = FakeBot()
    relay, stt, web = make(bot)
    relay.process_update(voice_update(duration=61))
    assert web.forwarded[0]["message"]["voice_error"] == "too_long"
    assert bot.calls == [] and bot.downloads == [] and stt.requests == []


def test_voice_of_exactly_60_seconds_is_accepted():
    relay, stt, web = make()
    relay.process_update(voice_update(duration=60))
    assert web.forwarded[0]["message"]["voice_text"]


def test_a_download_that_exceeds_2_mb_is_too_long_and_never_reaches_stt():
    relay, stt, web = make(FakeBot(data=b"x" * (2 * 1024 * 1024 + 1)))
    relay.process_update(voice_update())
    assert web.forwarded[0]["message"]["voice_error"] == "too_long"
    assert stt.requests == []


@pytest.mark.parametrize("fail", [
    urllib.error.URLError("refused"),
    TimeoutError("slow"),
    urllib.error.HTTPError("http://dxos-stt:8080/inference", 500, "boom", {}, io.BytesIO(b"x")),
])
def test_stt_failure_is_forwarded_as_stt_unavailable_without_a_retry(fail):
    relay, stt, web = make(stt=FakeStt(fail=fail))
    assert relay.process_update(voice_update()) is True
    assert web.forwarded[0]["message"]["voice_error"] == "stt_unavailable"
    assert "voice_text" not in web.forwarded[0]["message"]
    assert len(stt.requests) == 1


def test_a_bad_stt_answer_is_stt_unavailable():
    stt = FakeStt()
    stt.text = None  # {"text": null}
    relay, _, web = make(stt=stt)
    relay.process_update(voice_update())
    assert web.forwarded[0]["message"]["voice_error"] == "stt_unavailable"


def test_a_download_failure_is_stt_unavailable_and_nothing_is_posted():
    relay, stt, web = make(FakeBot(fail_on={"getFile": BotApiError("Bad Request: wrong file_id", code=400, permanent=True)}))
    relay.process_update(voice_update())
    assert web.forwarded[0]["message"]["voice_error"] == "stt_unavailable"
    assert stt.requests == []


@pytest.mark.parametrize("raw", ["", "   ", "[BLANK_AUDIO]", " (tiếng nhạc) "])
def test_silence_and_noise_markers_are_forwarded_as_empty_text(raw):
    relay, _, web = make(stt=FakeStt(text=raw))
    relay.process_update(voice_update())
    assert web.forwarded[0]["message"]["voice_text"] == ""


def test_text_is_cut_to_500_characters():
    relay, _, web = make(stt=FakeStt(text="a" * 900))
    relay.process_update(voice_update())
    assert web.forwarded[0]["message"]["voice_text"] == "a" * 500


def test_voice_in_a_group_is_forwarded_untouched_and_nothing_is_downloaded():
    bot = FakeBot()
    relay, stt, web = make(bot)
    relay.process_update(voice_update(chat_type="group"))
    assert bot.calls == [] and stt.requests == []
    message = web.forwarded[0]["message"]
    assert not any(key.startswith("voice") for key in message)


def test_without_an_stt_client_voice_is_stt_unavailable():
    web = FakeWeb()
    bot = FakeBot()
    Relay(bot, web, "test", stt=None).process_update(voice_update())
    assert web.forwarded[0]["message"]["voice_error"] == "stt_unavailable"
    assert bot.downloads == []


def test_nothing_but_the_stt_host_receives_audio_bytes_and_nothing_is_written_to_disk(tmp_path, monkeypatch):
    """Test 41: the web, the Bot API and the log get no audio; the relay opens no file for writing."""
    monkeypatch.chdir(tmp_path)
    opened = []
    real_open = open
    monkeypatch.setattr("builtins.open", lambda f, mode="r", *a, **k: (opened.append((f, mode)), real_open(f, mode, *a, **k))[1])
    bot, web = FakeBot(), FakeWeb()
    relay, stt, _ = make(bot, web=web)
    relay.process_update(voice_update())
    assert AUDIO in stt.requests[0][3]
    assert AUDIO.decode("latin-1") not in json.dumps(web.forwarded) and AUDIO.decode("latin-1") not in json.dumps(bot.calls)
    assert [mode for _, mode in opened if any(c in mode for c in "wax+")] == []
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("url", [
    "http://dxos-stt:8080", "http://localhost:8080", "http://127.0.0.1:8080", "http://10.0.0.5:8080",
    "http://172.20.0.3:8080", "http://192.168.1.9:8080", "http://[::1]:8080",
])
def test_private_or_internal_stt_hosts_are_accepted(url):
    assert validate_stt_url(url) == url.rstrip("/")


@pytest.mark.parametrize("url", [
    "http://stt.example.org:8080", "https://api.openai.com/v1", "http://8.8.8.8:8080", "http://dxos-stt.evil.example",
    "http://user@8.8.8.8", "ftp://dxos-stt", "dxos-stt:8080", "", "http://",
])
def test_a_public_or_malformed_stt_url_is_refused(url):
    with pytest.raises(SttError):
        validate_stt_url(url)


def test_stt_client_refuses_a_public_url_when_built():
    with pytest.raises(SttError):
        SttClient("http://stt.example.org")


def test_relay_start_with_a_public_stt_url_refuses_it_and_voice_stays_unavailable(tmp_path, caplog):
    (tmp_path / "telegram.env").write_text("DXOS_TELEGRAM_CLIENT_ID=a\nDXOS_TELEGRAM_CLIENT_SECRET=b\n")
    cfg = Config(interval_seconds=30, heartbeat_path=str(tmp_path / "hb"), bot_token="123:abc", env_dir=tmp_path,
                 stt_url="http://stt.example.org")
    started = []
    original = Relay.start
    Relay.start = lambda self: started.append(self)
    try:
        with caplog.at_level("ERROR", logger="dxos_telegram"):
            relay = telegram_main.start_relay(cfg)
    finally:
        Relay.start = original
    assert relay is not None and relay._stt is None
    assert "DXOS_STT_URL" in caplog.text and "stt.example.org" not in caplog.text


def test_config_reads_the_stt_url_with_its_default(monkeypatch):
    monkeypatch.delenv("DXOS_STT_URL", raising=False)
    assert Config.from_env().stt_url == "http://dxos-stt:8080"
    monkeypatch.setenv("DXOS_STT_URL", "http://localhost:9000/")
    assert Config.from_env().stt_url == "http://localhost:9000"


def test_redirects_are_not_followed():
    from dxos_telegram.stt import NoRedirect
    assert NoRedirect().redirect_request(None, None, 302, "Found", {}, "http://evil.example/") is None
