# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Zalo Notification Service calls for the relay. Errors say whether the message can be retried."""
import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Optional


@dataclass(frozen=True)
class ZnsCode:
    description: str
    permanent: bool  # this message can never be delivered; the web stops retrying
    token_expired: bool = False  # the relay refreshes the OA token and sends once more


# The ONE table of Zalo error codes the relay and the stub rely on (the stub serves them for fail-next).
# TODO(go-live): these codes MUST be checked against Zalo's public ZNS error table before going live;
# only -108, -118 and -124 come from the project plan, the rest are best knowledge and unverified.
ERROR_CODES: dict[int, ZnsCode] = {
    -100: ZnsCode("Zalo gặp lỗi hệ thống, thử lại sau", permanent=False),
    -108: ZnsCode("Số điện thoại không hợp lệ hoặc không dùng Zalo", permanent=True),
    -118: ZnsCode("Mẫu tin ZNS không hợp lệ", permanent=True),
    -124: ZnsCode("Đã hết hạn mức gửi tin ZNS", permanent=True),
    -216: ZnsCode("Access token của OA không hợp lệ hoặc đã hết hạn", permanent=False, token_expired=True),
}


class ZnsError(Exception):
    def __init__(
        self,
        description: str,
        *,
        code: int = 0,
        permanent: bool = False,
        token_expired: bool = False,
        retry_after: Optional[int] = None,
    ) -> None:
        super().__init__(description)
        self.description = description
        self.code = code
        self.permanent = permanent
        self.token_expired = token_expired
        self.retry_after = retry_after


class ZnsApi:
    """`POST <api_base>/message/template` and the OA token refresh. Tokens never appear in an error message."""

    def __init__(
        self,
        api_base: str,
        oauth_url: str,
        app_id: str,
        app_secret: str,
        urlopen_fn: Callable[..., Any] = urllib.request.urlopen,
        timeout_seconds: float = 15.0,
    ) -> None:
        self._base = api_base.rstrip("/")
        self._oauth_url = oauth_url
        self._app_id = app_id
        self._app_secret = app_secret
        self._urlopen = urlopen_fn
        self._timeout = timeout_seconds

    def send(self, access_token: str, item: Mapping[str, Any]) -> str:
        """Send one template message and return Zalo's message id."""
        body = {
            "phone": item["phone"],
            "template_id": item["zns_template_id"],
            "template_data": item["template_data"],
            "tracking_id": item["tracking_id"],
        }
        req = urllib.request.Request(
            f"{self._base}/message/template",
            data=json.dumps(body).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json", "access_token": access_token},
        )
        payload = self._request(req)
        data = payload.get("data")
        msg_id = data.get("msg_id") if isinstance(data, dict) else None
        if not msg_id:
            raise ZnsError("Zalo không trả mã tin")
        return str(msg_id)

    def refresh(self, refresh_token: str) -> dict[str, Any]:
        """Exchange the refresh token for a new pair; returns access_token, refresh_token and expires_in (seconds)."""
        if not self._app_id or not self._app_secret:
            raise ZnsError("ZALO_APP_ID và ZALO_APP_SECRET chưa được cấu hình nên không làm mới được token", permanent=True)
        form = urllib.parse.urlencode({"refresh_token": refresh_token, "app_id": self._app_id, "grant_type": "refresh_token"}).encode("utf-8")
        req = urllib.request.Request(
            self._oauth_url,
            data=form,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded", "secret_key": self._app_secret},
        )
        payload = self._request(req)
        try:
            return {
                "access_token": str(payload["access_token"]),
                "refresh_token": str(payload["refresh_token"]),
                "expires_in": int(payload["expires_in"]),
            }
        except (KeyError, TypeError, ValueError):
            raise ZnsError("Zalo trả về token không đúng dạng") from None

    def _request(self, req: urllib.request.Request) -> dict[str, Any]:
        try:
            with self._urlopen(req, timeout=self._timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            code = exc.code
            exc.close()  # CI runs the tests with -W error: an unclosed HTTP error response warns when collected
            raise ZnsError(
                f"HTTP {code}", code=code, retry_after=int(retry_after) if retry_after and retry_after.isdigit() else None
            ) from None
        except (urllib.error.URLError, OSError, ValueError) as exc:
            raise ZnsError(f"network error: {type(exc).__name__}") from None
        if not isinstance(payload, dict):
            raise ZnsError("Zalo trả về dữ liệu không đúng dạng")
        error = payload.get("error", 0)
        if error not in (0, None, "0"):
            known = ERROR_CODES.get(int(error)) if isinstance(error, int) else None
            if known is None:  # unknown code: retried, the web stops after ten attempts
                raise ZnsError(str(payload.get("message") or f"Zalo error {error}"), code=error if isinstance(error, int) else 0)
            raise ZnsError(known.description, code=int(error), permanent=known.permanent, token_expired=known.token_expired)
        return payload
