# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The relay: forwards Telegram updates to the web, sends what the web returns, and drains the web's outbox."""
import base64
import logging
import threading
from typing import Any, Mapping, Optional

from .bot_api import BotApi, BotApiError
from .gateway import GatewayError, WebGateway
from .stt import SttClient, SttError

log = logging.getLogger("dxos_telegram")

OUTBOX_LIMIT = 20
OUTBOX_INTERVAL_SECONDS = 2.0
HEARTBEAT_INTERVAL_SECONDS = 60.0
POLL_TIMEOUT_SECONDS = 30
PHOTO_MAX_BYTES = 5 * 1024 * 1024  # C1: larger photos are not forwarded
CAPTION_MAX = 1024  # Telegram's limit for a photo caption
ALBUM_MAX = 4  # C8: a finished build sends its four screenshots
AUDIO_UNAVAILABLE = "Chưa đọc được bản tin lúc này."  # the line the web uses when the voice service is down
VOICE_MAX_SECONDS = 60  # M15 C2
VOICE_MAX_BYTES = 2 * 1024 * 1024


class Backoff:
    """Doubling wait from 1 s up to 60 s, reset after a success."""

    def __init__(self) -> None:
        self._next = 1.0

    def next(self) -> float:
        wait = self._next
        self._next = min(self._next * 2, 60.0)
        return wait

    def reset(self) -> None:
        self._next = 1.0


def forwardable_update(update: Mapping[str, Any]) -> dict[str, Any]:
    """Keep only the fields the web reads (C2); everything else the relay drops."""
    out: dict[str, Any] = {"update_id": update["update_id"]}
    if "message" in update:
        out["message"] = _drop_none(
            {
                "message_id": update["message"]["message_id"],
                "chat": _chat(update["message"]["chat"]),
                "from": _user(update["message"].get("from")),
                "text": update["message"].get("text"),
                "caption": update["message"].get("caption"),
                "location": _location(update["message"].get("location")),
            }
        )
    if "callback_query" in update:
        query = update["callback_query"]
        message = query.get("message")
        out["callback_query"] = _drop_none(
            {
                "id": query["id"],
                "from": _user(query.get("from")),
                "message": _drop_none(
                    {"message_id": message["message_id"], "chat": _chat(message["chat"])} if message else None
                ),
                "data": query.get("data"),
            }
        )
    return out


def message_call(item: Mapping[str, Any]) -> tuple[str, dict[str, Any]]:
    """Bot API method and parameters for one OutboxMessage (C2). An edit always sends its keyboard, so a decided message loses its buttons."""
    markup = {"inline_keyboard": item.get("buttons") or []}
    if item["op"] == "edit":
        return "editMessageText", {
            "chat_id": item["chat_id"],
            "message_id": item["edit_message_id"],
            "text": item["text"],
            "reply_markup": markup,
        }
    params: dict[str, Any] = {"chat_id": item["chat_id"], "text": item["text"]}
    if item.get("buttons"):
        params["reply_markup"] = markup
    return "sendMessage", params


class Relay:
    """Three loops (updates, outbox, heartbeat) on daemon threads; `process_update` and `deliver` do the work and are testable alone."""

    def __init__(self, bot: BotApi, web: WebGateway, version: str, web_public_url: str = "", stt: Optional[SttClient] = None) -> None:
        self._bot = bot
        self._web = web
        self._version = version
        self._web_public_url = web_public_url
        self._stt = stt
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []

    def set_menu_button(self) -> None:
        """C2: the bot's menu button opens the web as a Mini App, which Telegram only allows over HTTPS."""
        if not self._web_public_url.startswith("https://"):
            log.info("Mini App needs an HTTPS web address; the menu button is not set.")
            return
        button = {"type": "web_app", "text": "Mở ứng dụng", "web_app": {"url": f"{self._web_public_url.rstrip('/')}/telegram/open"}}
        self._send_best_effort("setChatMenuButton", {"menu_button": button})

    def start(self) -> None:
        self.set_menu_button()
        for target in (self._poll_loop, self._outbox_loop, self._heartbeat_loop):
            thread = threading.Thread(target=target, name=target.__name__, daemon=True)
            thread.start()
            self._threads.append(thread)

    def stop(self) -> None:
        self._stop.set()
        for thread in self._threads:
            thread.join(timeout=5)

    def _poll_loop(self) -> None:
        offset = 0
        backoff = Backoff()
        while not self._stop.is_set():
            try:
                updates = self._bot.call(
                    "getUpdates",
                    {"offset": offset, "timeout": POLL_TIMEOUT_SECONDS, "allowed_updates": ["message", "callback_query"]},
                    timeout=POLL_TIMEOUT_SECONDS + 10,
                )
            except BotApiError as exc:
                log.warning("getUpdates failed (%s); retrying", exc.description)
                self._stop.wait(backoff.next())
                continue
            backoff.reset()
            for update in updates or []:
                if not self.process_update(update):
                    # The web did not take it: keep it unacknowledged and fetch it again after a pause.
                    self._stop.wait(backoff.next())
                    break
                offset = update["update_id"] + 1

    def process_update(self, update: Mapping[str, Any]) -> bool:
        """Forward one update and send the web's replies. False means the web did not accept it (retry later)."""
        try:
            forwarded = forwardable_update(update)
        except (KeyError, TypeError):
            log.warning("dropping a malformed update %s", update.get("update_id"))
            return True
        if "photo" in update.get("message", {}):
            forwarded["message"].update(self._photo_fields(update["message"]["photo"]))
        if "voice" in update.get("message", {}) and update["message"]["chat"].get("type") == "private":
            forwarded["message"].update(self._voice_fields(update["message"]["voice"]))
        try:
            data = self._web.forward_update(forwarded)
        except GatewayError as exc:
            log.warning("web refused update: %s", exc)
            return False
        answer = data.get("answer_callback")
        if answer and "callback_query" in update:
            self._send_best_effort(
                "answerCallbackQuery",
                {
                    "callback_query_id": update["callback_query"]["id"],
                    "text": answer.get("text", ""),
                    "show_alert": bool(answer.get("show_alert", False)),
                },
            )
        for reply in data.get("replies") or []:
            audio = reply.get("audio")
            if isinstance(audio, Mapping) and audio.get("kind") == "bulletin" and reply.get("op") != "edit":
                self._send_bulletin_audio(reply, str(audio.get("id")))
            else:
                self._send_best_effort(*message_call(reply))
        return True

    def _send_bulletin_audio(self, reply: Mapping[str, Any], bulletin_id: str) -> None:
        """Issue #80 C4: the web writes the bulletin to a WAV file; no OGG/Opus encoder is installed, so it goes as a document.

        The web checked the voice service just before, but it can stop in between: the person then gets the plain line.
        """
        try:
            wav = self._web.fetch_bulletin_audio(bulletin_id)
        except GatewayError as exc:
            log.warning("bulletin audio not sent: %s", exc)
            self._send_best_effort("sendMessage", {"chat_id": reply["chat_id"], "text": AUDIO_UNAVAILABLE})
            return
        try:
            self._bot.call_files(
                "sendDocument",
                {"chat_id": reply["chat_id"], "caption": str(reply["text"])[:CAPTION_MAX]},
                {"document": ("ban-tin.wav", wav, "audio/wav")},
            )
        except BotApiError as exc:
            log.warning("sendDocument failed: %s", exc.description)

    def _photo_fields(self, sizes: Any) -> dict[str, Any]:
        """C1 photo fields: the largest size up to 5 MB, downloaded as bytes. A failure is forwarded as photo_error."""
        try:
            fitting = [size for size in sizes if size.get("file_size", 0) <= PHOTO_MAX_BYTES]
        except (AttributeError, TypeError):
            return {"photo_error": "download_failed"}
        if not fitting:
            return {"photo_error": "too_large"}
        size = max(fitting, key=lambda item: item.get("file_size", 0))
        try:
            file_path = self._bot.call("getFile", {"file_id": size["file_id"]})["file_path"]
            data = self._bot.download(file_path)
            file_unique_id = size["file_unique_id"]
        except (BotApiError, KeyError, TypeError):
            return {"photo_error": "download_failed"}
        if len(data) > PHOTO_MAX_BYTES:
            return {"photo_error": "too_large"}
        return {"photo": {"mime_type": "image/jpeg", "data_base64": base64.b64encode(data).decode("ascii"), "file_unique_id": file_unique_id}}

    def _voice_fields(self, voice: Any) -> dict[str, Any]:
        """M15 C2: a voice message of at most 60 s is transcribed on the cooperative's own server. The audio stays in memory and only the text goes on."""
        duration = voice.get("duration") if isinstance(voice, Mapping) else None
        if not isinstance(duration, int) or isinstance(duration, bool) or duration < 0:
            return {"voice_error": "stt_unavailable"}
        if duration > VOICE_MAX_SECONDS:
            return {"voice_error": "too_long", "voice_duration": duration}
        if self._stt is None:
            return {"voice_error": "stt_unavailable"}
        try:
            file_path = self._bot.call("getFile", {"file_id": voice["file_id"]})["file_path"]
            audio = self._bot.download(file_path, max_bytes=VOICE_MAX_BYTES)
        except (BotApiError, KeyError, TypeError):
            return {"voice_error": "stt_unavailable"}
        if len(audio) > VOICE_MAX_BYTES:
            return {"voice_error": "too_long", "voice_duration": duration}
        try:
            return {"voice_text": self._stt.transcribe(audio), "voice_duration": duration}
        except SttError as exc:
            log.warning("speech to text failed: %s", exc)  # no retry: the person types instead
            return {"voice_error": "stt_unavailable"}

    def _send_best_effort(self, method: str, params: Mapping[str, Any]) -> None:
        # Replies are answers to a user's action, not queued proposals: a failed one is logged, not retried.
        try:
            self._bot.call(method, params)
        except BotApiError as exc:
            log.warning("%s failed: %s", method, exc.description)

    def _outbox_loop(self) -> None:
        backoff = Backoff()
        while not self._stop.is_set():
            try:
                items = self._web.lease_outbox(OUTBOX_LIMIT)
            except GatewayError as exc:
                log.warning("outbox unavailable: %s", exc)
                self._stop.wait(backoff.next())
                continue
            backoff.reset()
            pause = self.deliver(items) if items else 0.0
            self._stop.wait(pause or OUTBOX_INTERVAL_SECONDS)

    def deliver(self, items: list[Mapping[str, Any]]) -> float:
        """Send leased messages in order and report each result. Returns how long to pause before the next lease (0 = none)."""
        for item in items:
            if self._stop.is_set():
                return 0.0  # the leases expire and the next start sends them again
            try:
                if item.get("photos") and item["op"] != "edit":
                    message_id = self._send_photos(item)
                else:
                    method, params = message_call(item)
                    message_id = self._bot_message_id(method, params, item)
            except BotApiError as exc:
                if exc.permanent:
                    self._report(item, {"ok": False, "error": exc.description, "permanent": True})
                    continue
                self._report(item, {"ok": False, "error": exc.description, **_retry(exc)})
                return float(exc.retry_after or 5)
            if message_id is None:
                self._report(item, {"ok": False, "error": "no message id", "permanent": False})
                return 5.0
            self._report(item, {"ok": True, "telegram_message_id": message_id})
        return 0.0

    def _send_photos(self, item: Mapping[str, Any]) -> Optional[int]:
        """C8: the text as the caption of the screenshots, as one album. Buttons cannot ride on an album, so none are sent.

        A screenshot the web cannot serve is left out; with none left the text goes alone, so the manager is still told.
        """
        shots: list[tuple[str, bytes]] = []
        for ref in list(item["photos"])[:ALBUM_MAX]:
            try:
                shots.append((str(ref["name"]), self._web.fetch_media(str(ref["build_id"]), str(ref["name"]))))
            except (GatewayError, KeyError) as exc:
                log.warning("screenshot %s not sent: %s", ref, exc)
        if not shots:
            method, params = message_call({**item, "buttons": None})
            return self._bot_message_id(method, params, item)
        caption = str(item["text"])[:CAPTION_MAX]
        files = {f"p{i}": (name, data, "image/png") for i, (name, data) in enumerate(shots)}
        if len(shots) == 1:
            result = self._bot.call_files("sendPhoto", {"chat_id": item["chat_id"], "caption": caption}, {"photo": files["p0"]})
        else:
            media = [{"type": "photo", "media": f"attach://{key}", **({"caption": caption} if i == 0 else {})}
                     for i, key in enumerate(files)]
            result = self._bot.call_files("sendMediaGroup", {"chat_id": item["chat_id"], "media": media}, files)
        first = result[0] if isinstance(result, list) and result else result
        return int(first["message_id"]) if isinstance(first, dict) and "message_id" in first else None

    def _bot_message_id(self, method: str, params: Mapping[str, Any], item: Mapping[str, Any]) -> Optional[int]:
        try:
            result = self._bot.call(method, params)
        except BotApiError as exc:
            if method == "editMessageText" and "not modified" in exc.description:
                return int(item["edit_message_id"])  # the text is already what the web wants
            raise
        if method == "editMessageText" and isinstance(result, bool):
            return int(item["edit_message_id"])
        return int(result["message_id"]) if isinstance(result, dict) and "message_id" in result else None

    def _report(self, item: Mapping[str, Any], result: Mapping[str, Any]) -> None:
        try:
            self._web.report_result(str(item["id"]), dict(result))
        except GatewayError as exc:
            log.warning("could not report outbox result: %s", exc)

    def _heartbeat_loop(self) -> None:
        while True:
            try:
                self._web.heartbeat(self._version)
            except GatewayError as exc:
                log.warning("heartbeat failed: %s", exc)
            if self._stop.wait(HEARTBEAT_INTERVAL_SECONDS):
                return


def _retry(exc: BotApiError) -> dict[str, Any]:
    return {"retry_after_seconds": exc.retry_after} if exc.retry_after is not None else {}


def _chat(chat: Mapping[str, Any]) -> dict[str, Any]:
    return {"id": chat["id"], "type": chat["type"]}


def _location(location: Optional[Mapping[str, Any]]) -> Optional[dict[str, Any]]:
    return {"latitude": location["latitude"], "longitude": location["longitude"]} if location else None


def _user(user: Optional[Mapping[str, Any]]) -> Optional[dict[str, Any]]:
    return {"id": user["id"]} if user else None


def _drop_none(values: Optional[Mapping[str, Any]]) -> dict[str, Any]:
    return {key: value for key, value in (values or {}).items() if value is not None}
