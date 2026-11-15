# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Shared request helpers: URLs, templates, claims, the bounded database gate.

The gateway strips /apps/tea-tour, so routes are /, /tours, /guide, /public/...; every link, form and redirect writes
the prefix back, because the browser goes through the web proxy and the gateway. Writes are POST + 303.
"""
import os
import re
import threading
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlencode

from fastapi import Depends, Header, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from jinja2 import pass_context
from starlette.exceptions import HTTPException

from tea_tour import appkit, assets, store
from tea_tour.claims import Claims, read_claims
from tea_tour.domain.policy import VN_TZ  # noqa: F401  (re-exported: the one definition of Vietnam time)
from tea_tour.store.core import Actor

PREFIX = "/apps/tea-tour"
THEMES = ("light", "dark")  # the shell passes ?theme=; without it the pages follow the system setting
HTX_RE = re.compile(r"[A-Za-z0-9_-]{1,32}")
ERRORS = {401: "Cần đăng nhập để xem trang này.", 403: "Tài khoản của bạn không được vào trang này.",
          404: "Không có trang này.", 405: "Không có trang này.", 413: "Tệp gửi lên quá lớn.",
          503: "Hệ thống đang bận. Vui lòng thử lại sau ít phút."}
ADMIN_TABS = (("overview", "Tổng quan", "/"), ("tours", "Tour", "/tours"), ("departures", "Lịch", "/departures"),
              ("bookings", "Lượt đặt", "/bookings"), ("payments", "Thu tiền", "/payments"),
              ("customers", "Khách", "/customers"), ("reviews", "Đánh giá", "/reviews"),
              ("reports", "Báo cáo", "/reports"), ("settings", "Cài đặt", "/settings"))
DB_MAX_CONNECTIONS = 8  # the app role allows 10; leaves room for ./dxos install and an admin
DB_WAIT_S = 2
DB_SLOTS = threading.BoundedSemaphore(DB_MAX_CONNECTIONS)


# ---------- URLs ----------

def href(path: str, theme: str = "", **params) -> str:
    """An address inside the app, with the prefix and the carried ?theme=. Parameters that are None are left out."""
    query = {**{k: v for k, v in params.items() if v is not None}, **({"theme": theme} if theme else {})}
    return f"{PREFIX}{path}" + (f"?{urlencode(query)}" if query else "")


def site_href(htx: str, path: str, theme: str = "", **params) -> str:
    """An address of the customer site of a cooperative: /public/<htx><path>."""
    return href(f"/public/{htx}{path}", theme, **params)


def theme_of(request: Request) -> str:
    theme = request.query_params.get("theme", "")
    return theme if theme in THEMES else ""


def _route_path(request: Request) -> str:
    path = request.scope["path"]
    return path.removeprefix(PREFIX)  # depending on the server, scope["path"] may still carry the root path


def assets_base(request: Request) -> str:
    """Where this page's stylesheet, fonts and images are served from (public, guide or manager area)."""
    htx = request.path_params.get("htx")
    if htx and _route_path(request).startswith("/public/"):
        return f"{PREFIX}/public/{htx}/assets/"
    return f"{PREFIX}/guide/assets/" if _route_path(request).startswith("/guide") else f"{PREFIX}/assets/"


def tab_items(theme: str = "") -> list[tuple[str, str, str]]:
    return [(key, label, href(path, theme)) for key, label, path in ADMIN_TABS]


# ---------- templates ----------

templates = Jinja2Templates(directory=[Path(__file__).parent / "templates", assets.STATIC_DIR])  # icons.html lives in static/


@pass_context
def asset_url(context, name: str) -> str:
    """Full address of a static file for the page being rendered, e.g. {{ asset_url('site.css') }}."""
    return context["assets"] + assets.static_url(name)


templates.env.globals.update(href=href, site_href=site_href, prefix=PREFIX, static_url=assets.static_url,
                             asset_url=asset_url, tab_items=tab_items)
templates.env.filters["vnd"] = appkit.money
templates.env.filters["vn_date"] = appkit.vn_date
templates.env.filters["vn_datetime"] = appkit.vn_datetime


def page(request: Request, name: str, status: int = 200, **context) -> HTMLResponse:
    """Render a template with the context every page gets: theme, htx (on public pages), assets, prefix."""
    base = {"theme": theme_of(request), "assets": assets_base(request), "htx": request.path_params.get("htx", "")}
    return templates.TemplateResponse(request, name, {**base, **context}, status_code=status)


def redirect(request: Request, path: str, **params) -> RedirectResponse:
    """303 to a path inside the app, carrying ?theme=."""
    return RedirectResponse(href(path, theme_of(request), **params), status_code=303)


# ---------- claims and database ----------

def signed_in(authorization: str | None = Header(None)) -> Claims:
    claims = read_claims(authorization)
    if claims is None:
        raise HTTPException(401)
    return claims


def role(name: str):
    """The gateway already checks the role per prefix; this keeps the app safe if a route is ever widened."""
    def check(claims: Claims = Depends(signed_in)) -> Claims:
        if name not in claims.roles or not claims.htx_code:
            raise HTTPException(403)
        return claims
    return check


def actor_of(claims: Claims, kind: str) -> Actor:
    """The person behind a request, for the booking history and the payment ledger (kind: MANAGER or GUIDE)."""
    return Actor(kind, claims.name or claims.sub, claims.sub)


@contextmanager
def open_db():
    """At most DB_MAX_CONNECTIONS at once, below the role's CONNECTION LIMIT 10; a full house answers 503."""
    if not DB_SLOTS.acquire(timeout=DB_WAIT_S):
        raise HTTPException(503)
    try:
        with store.connect(os.environ["DXOS_APP_DB_URL"]) as conn:
            yield conn
    finally:
        DB_SLOTS.release()


def db():
    with open_db() as conn:
        yield conn


def public_htx(htx: str) -> str:
    if not HTX_RE.fullmatch(htx):
        raise HTTPException(404)
    return htx
