# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The relay: leases the web's Zalo outbox, sends each row through ZNS and reports the result. Idle without OA tokens."""
import logging
import threading
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Optional

from .gateway import GatewayError, WebGateway
from .zns_api import ZnsApi, ZnsError

log = logging.getLogger("dxos_zalo")

OUTBOX_LIMIT = 20
OUTBOX_INTERVAL_SECONDS = 2.0
TICK_INTERVAL_SECONDS = 300.0
HEARTBEAT_INTERVAL_SECONDS = 60.0
CREDENTIALS_TTL_SECONDS = 60.0  # how long the tokens read from the web are trusted
REFRESH_MARGIN_SECONDS = 600.0  # refresh when less than 10 minutes remain
REFRESH_RETRY_SECONDS = 60.0  # wait after a failed refresh, so Zalo is not hit every 2 s
ITEM_FIELDS = ("id", "phone", "zns_template_id", "template_data", "tracking_id")


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


def _epoch(value: Any) -> float:
    """expires_at as the web stores it: an ISO-8601 string or epoch seconds."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return datetime.fromisoformat(str(value)).timestamp()


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")


def mask_phone(phone: Any) -> str:
    return "***" + str(phone)[-3:]


class OaTokens:
    """The OA token pair: read from the web, refreshed against Zalo, saved back. Refresh tokens are single use, so a pair
    the web did not accept stays in memory and is saved again before anything else happens."""

    def __init__(self, web: WebGateway, zns: ZnsApi, clock: Callable[[], float]) -> None:
        self._web, self._zns, self._clock = web, zns, clock
        self._creds: Optional[dict[str, Any]] = None
        self._fetched_at: Optional[float] = None
        self._unsaved = False
        self._refresh_retry_at = 0.0

    def access_token(self) -> Optional[str]:
        """A usable access token, or None while no OA token is configured or it cannot be renewed."""
        if self._unsaved:
            self._save()
        elif self._fetched_at is None or self._clock() - self._fetched_at >= CREDENTIALS_TTL_SECONDS:
            self._creds = self._web.get_credentials()  # GatewayError goes to the caller
            self._fetched_at = self._clock()
        if self._creds is None:
            return None
        if _epoch(self._creds["expires_at"]) - self._clock() < REFRESH_MARGIN_SECONDS:
            self.refresh()
        if _epoch(self._creds["expires_at"]) <= self._clock():
            return None  # expired and not renewable right now
        return str(self._creds["access_token"])

    def refresh(self) -> bool:
        """Renew the pair now (also after an expired-token answer). False when Zalo refused or is out of reach."""
        if self._creds is None or self._clock() < self._refresh_retry_at:
            return False
        try:
            fresh = self._zns.refresh(str(self._creds["refresh_token"]))
        except ZnsError as exc:
            self._refresh_retry_at = self._clock() + REFRESH_RETRY_SECONDS
            log.warning("OA token refresh failed: %s", exc.description)
            return False
        self._creds = {
            "access_token": fresh["access_token"],
            "refresh_token": fresh["refresh_token"],
            "expires_at": _iso(self._clock() + fresh["expires_in"]),
        }
        self._unsaved = True
        self._save()
        return True

    def _save(self) -> None:
        try:
            self._web.save_credentials(self._creds or {})
        except GatewayError as exc:
            log.warning("could not save the refreshed OA token: %s", exc)
            return
        self._unsaved = False


class Relay:
    """Three loops (outbox, tick, heartbeat) on daemon threads; the run_*_once methods do the work and are testable alone."""

    def __init__(self, zns: ZnsApi, web: WebGateway, version: str, tokens: OaTokens) -> None:
        self._zns, self._web, self._version, self._tokens = zns, web, version, tokens
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []

    def start(self) -> None:
        for target in (self._outbox_loop, self._tick_loop, self._heartbeat_loop):
            thread = threading.Thread(target=target, name=target.__name__, daemon=True)
            thread.start()
            self._threads.append(thread)

    def stop(self) -> None:
        self._stop.set()
        for thread in self._threads:
            thread.join(timeout=5)

    def run_outbox_once(self) -> float:
        """One lease-and-send pass. Returns how long to pause before the next one."""
        token = self._tokens.access_token()
        if token is None:
            return OUTBOX_INTERVAL_SECONDS  # idle: nothing is leased while there is no usable OA token
        items = self._web.lease_outbox(OUTBOX_LIMIT)
        return (self.deliver(items) if items else 0.0) or OUTBOX_INTERVAL_SECONDS

    def run_tick_once(self) -> None:
        if self._tokens.access_token() is None:
            return
        log.info("tick queued %d messages", self._web.tick())

    def run_heartbeat_once(self) -> None:
        self._web.heartbeat(self._version)

    def deliver(self, items: list[Mapping[str, Any]]) -> float:
        """Send leased rows in order and report each result. Returns a pause when Zalo asked for one (0 = none)."""
        for item in items:
            if self._stop.is_set():
                return 0.0  # the leases expire and the next start sends them again
            if any(item.get(field) in (None, "") for field in ITEM_FIELDS):
                self._report(item, {"ok": False, "error": "Dòng tin thiếu dữ liệu", "permanent": True})
                continue
            token = self._tokens.access_token()
            if token is None:
                return OUTBOX_INTERVAL_SECONDS  # the rest of the leases expire and are leased again
            try:
                msg_id = self._send(token, item)
            except ZnsError as exc:
                log.warning("send to %s failed: %s", mask_phone(item["phone"]), exc.description)
                # The Zalo code leads the text: the web maps it to the Vietnamese reason shown to the head.
                error = f"{exc.code} {exc.description}" if exc.code else exc.description
                result: dict[str, Any] = {"ok": False, "error": error, "permanent": exc.permanent}
                if exc.retry_after is not None:
                    result["retry_after_seconds"] = exc.retry_after
                self._report(item, result)
                if exc.retry_after is not None:
                    return float(exc.retry_after)
                continue
            self._report(item, {"ok": True, "zalo_msg_id": msg_id})
        return 0.0

    def _send(self, token: str, item: Mapping[str, Any]) -> str:
        try:
            return self._zns.send(token, item)
        except ZnsError as exc:
            if not exc.token_expired or not self._tokens.refresh():
                raise
        fresh = self._tokens.access_token()
        if fresh is None:
            raise ZnsError("Access token của OA đã hết hạn")
        return self._zns.send(fresh, item)  # an expired-token answer again is reported, not looped

    def _report(self, item: Mapping[str, Any], result: Mapping[str, Any]) -> None:
        try:
            self._web.report_result(str(item.get("id")), dict(result))
        except GatewayError as exc:
            log.warning("could not report outbox result: %s", exc)

    def _loop(self, work: Callable[[], Any], interval: Optional[float], name: str) -> None:
        backoff = Backoff()
        while not self._stop.is_set():
            try:
                pause = work()
            except GatewayError as exc:
                log.warning("%s unavailable: %s", name, exc)
                wait = backoff.next()
            else:
                backoff.reset()
                wait = pause if isinstance(pause, float) else (interval or 0.0)
            if self._stop.wait(wait):
                return

    def _outbox_loop(self) -> None:
        self._loop(self.run_outbox_once, OUTBOX_INTERVAL_SECONDS, "outbox")

    def _tick_loop(self) -> None:
        self._loop(self.run_tick_once, TICK_INTERVAL_SECONDS, "tick")

    def _heartbeat_loop(self) -> None:
        self._loop(self.run_heartbeat_once, HEARTBEAT_INTERVAL_SECONDS, "heartbeat")
