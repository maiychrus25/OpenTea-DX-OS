# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Mini-app htx-dashboard: một góc nhìn tổng thể, chỉ đọc, về hợp tác xã của trưởng HTX.

The gateway strips /apps/htx-dashboard, so routes are /, /production, /parcels, /parcels/<code>, /health, /lots, /data;
every link writes the prefix back. The app has no database and writes nothing: every figure comes from the core through
Hasura with the viewer's own token (core_client), is computed by `metrics` and drawn by the templates.
"""
import hashlib
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, Response
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException

from htx_dashboard import appkit, core_client, metrics, pages
from htx_dashboard.claims import Claims, read_claims

PREFIX = "/apps/htx-dashboard"
APP_ID = "htx-dashboard"
THEMES = ("light", "dark")  # the shell passes ?theme=; without it /dxos-app.css follows the system setting
ERRORS = {401: "Cần đăng nhập để xem trang này.", 403: "Tài khoản của bạn không được vào trang này.",
          404: "Không tìm thấy trang này.", 405: "Không tìm thấy trang này.", 503: "Hệ thống đang bận. Vui lòng thử lại sau ít phút."}
TABS = (("overview", "Tổng quan", "/"), ("production", "Sản xuất", "/production"), ("parcels", "Vùng trồng", "/parcels"),
        ("health", "Sức khoẻ cây", "/health"), ("lots", "Lô chè", "/lots"), ("data", "Dữ liệu", "/data"))
# Pages of the core, opened in the top window (the app is framed): routes under apps/web/src/app/manager/.
CORE_PAGES = {"journal_approve": "/manager/journal-approve", "schedule": "/manager/schedule", "lots": "/manager/lots",
              "farm_zones": "/manager/farm-zones", "dashboard": "/manager/dashboard"}
JOURNAL_LABEL = {"PENDING_APPROVAL": "Chờ duyệt", "REQUEST_CHANGES": "Cần sửa", "APPROVED": "Đã duyệt", "REJECTED": "Từ chối"}

log = logging.getLogger("htx_dashboard")
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")
core = core_client.Core()

CSS = (Path(__file__).parent / "static" / "dashboard.css").read_bytes()
CSS_NAME = f"dashboard.{hashlib.sha256(CSS).hexdigest()[:10]}.css"  # the hash in the name lets the file be cached for good


def now() -> datetime:
    return datetime.now(timezone.utc)


def href(path: str, theme: str = "", days: int = pages.DEFAULT_DAYS, **params) -> str:
    query = {k: v for k, v in params.items() if v not in (None, "")}
    if days != pages.DEFAULT_DAYS:
        query["days"] = days
    if theme:
        query["theme"] = theme
    return f"{PREFIX}{path}" + (f"?{urlencode(query)}" if query else "")


def pill(status: str) -> str:
    return {"CONFIRMED": "pill", "PENDING": "pill warn", "REJECTED": "pill neutral", "READY": "pill", "QR_EXPORTED": "pill",
            "DRAFT": "pill neutral"}.get(status, "pill neutral")


templates.env.globals.update(prefix=PREFIX, tabs_def=TABS, ERROR_TEXT=pages.ERROR_TEXT, css_name=CSS_NAME, pill=pill,
                             parcel_status=metrics.PARCEL_STATUS, status_class=pages.STATUS_CLASS, sensor_label=metrics.sensor_label,
                             periods=pages.PERIODS, sensor_silent_hours=metrics.SENSOR_SILENT_HOURS, kind=metrics.disease_kind,
                             activity=metrics.ACTIVITY, journal_status=JOURNAL_LABEL, disease_status=metrics.DISEASE_STATUS,
                             lot_status=metrics.LOT_STATUS, commodity_vn=metrics.COMMODITY_VN, metric_vn=metrics.metric_vn)
templates.env.filters["num"] = lambda v, digits=1: appkit.number(v, digits)
templates.env.filters["vn_date"] = appkit.vn_date
templates.env.filters["vn_datetime"] = appkit.vn_datetime
templates.env.filters["vn_day"] = lambda ts: appkit.vn_date(metrics.vn_day(ts))
templates.env.filters["kg"] = pages.kg_text


def render(request: Request, name: str, http_status: int = 200, claims: Claims | None = None, current: str = "", days: int = pages.DEFAULT_DAYS,
           here: str = "/", keep: dict | None = None, **context) -> HTMLResponse:
    theme = request.query_params.get("theme", "")
    theme = theme if theme in THEMES else ""
    keep = keep or {}
    moment = now()

    def link(path: str, **params) -> str:
        return href(path, theme, params.pop("days", days), **params)

    def core_link(key: str) -> str:
        return CORE_PAGES[key]

    tab_items = [(key, label, link(path)) for key, label, path in TABS] if claims else None
    return templates.TemplateResponse(request, name, {
        "theme": theme, "tabs": tab_items, "current": current, "days": days, "link": link, "core_link": core_link,
        "here": here, "keep": keep, "now": moment, "generated": appkit.vn_datetime(moment),
        "htx": claims.htx_code if claims else "", "back": appkit.shell_url("manager", APP_ID, here), **context}, status_code=http_status)


def message(request: Request, status: int, text: str) -> HTMLResponse:
    return render(request, "message.html", status, message=text)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return message(request, exc.status_code, ERRORS.get(exc.status_code, "Có lỗi xảy ra."))


@app.exception_handler(RequestValidationError)
async def bad_path(request: Request, exc: RequestValidationError):
    return message(request, 404, ERRORS[404])


@app.exception_handler(Exception)
async def server_error(request: Request, exc: Exception):
    # Starlette re-raises after this response, so uvicorn still logs the traceback; the user never sees it.
    return message(request, 500, "Có lỗi xảy ra. Vui lòng thử lại sau.")


def manager(authorization: str | None = Header(None)) -> Claims:
    """401 without a token, 403 for any other role or a token without a cooperative (the gateway checks the role too)."""
    claims = read_claims(authorization)
    if claims is None:
        raise HTTPException(401)
    if "manager" not in claims.roles or not claims.htx_code:
        raise HTTPException(403)
    return claims


def auth_of(request: Request) -> str:
    return request.headers["authorization"]


def period(request: Request) -> int:
    return pages.parse_days(request.query_params.get("days"))


@app.get("/healthz")
def healthz() -> Response:
    return Response("ok", media_type="text/plain")


@app.get("/assets/{name}")
def asset(name: str, claims: Claims = Depends(manager)) -> Response:
    if name != CSS_NAME:
        raise HTTPException(404)
    return Response(CSS, media_type="text/css; charset=utf-8", headers={"cache-control": "public, max-age=31536000, immutable"})


# ---------- tabs ----------

@app.get("/", response_class=HTMLResponse)
def overview(request: Request, claims: Claims = Depends(manager)):
    days = period(request)
    ctx = pages.overview(core, auth_of(request), claims.htx_code, now(), days)
    return render(request, "overview.html", claims=claims, current="overview", here="/", **ctx)


@app.get("/production", response_class=HTMLResponse)
def production(request: Request, claims: Claims = Depends(manager)):
    days = period(request)
    ctx = pages.production(core, auth_of(request), claims.htx_code, now(), days)
    return render(request, "production.html", claims=claims, current="production", here="/production", **ctx)


def list_query(request: Request) -> dict:
    return dict(request.query_params)


@app.get("/parcels", response_class=HTMLResponse)
def parcels(request: Request, claims: Claims = Depends(manager)):
    days = period(request)
    ctx = pages.parcels_list(core, auth_of(request), claims.htx_code, now(), days, list_query(request))
    return render(request, "parcels.html", claims=claims, current="parcels", here="/parcels", keep=ctx["filter"], **ctx)


@app.get("/health", response_class=HTMLResponse)
def health(request: Request, claims: Claims = Depends(manager)):
    days = period(request)
    ctx = pages.health(core, auth_of(request), claims.htx_code, now(), days)
    return render(request, "health.html", claims=claims, current="health", here="/health", **ctx)


@app.get("/lots", response_class=HTMLResponse)
def lots(request: Request, claims: Claims = Depends(manager)):
    days = period(request)
    ctx = pages.lots_page(core, auth_of(request), claims.htx_code, now(), days, list_query(request))
    return render(request, "lots.html", claims=claims, current="lots", here="/lots", **ctx)


@app.get("/data", response_class=HTMLResponse)
def data(request: Request, claims: Claims = Depends(manager)):
    days = period(request)
    ctx = pages.data_page(core, auth_of(request), claims.htx_code, now(), days)
    return render(request, "data.html", claims=claims, current="data", here="/data", **ctx)


# ---------- the parcel page: the code is checked against a pattern before any query ----------

# Declared after /parcels/export.csv and /parcels/print so those names are not taken for parcel codes.
def _tab_builders(request: Request, claims: Claims, days: int):
    auth, htx, moment, query = auth_of(request), claims.htx_code, now(), list_query(request)
    return {
        "production": lambda: pages.production(core, auth, htx, moment, days),
        "parcels": lambda: pages.parcels_list(core, auth, htx, moment, days, query),
        "health": lambda: pages.health(core, auth, htx, moment, days),
        "lots": lambda: pages.lots_page(core, auth, htx, moment, days, query),
        "data": lambda: pages.data_page(core, auth, htx, moment, days),
    }


TAB_NAMES = ("production", "parcels", "health", "lots", "data")
TAB_HERE = {"production": "/production", "parcels": "/parcels", "health": "/health", "lots": "/lots", "data": "/data"}


def export_of(request: Request, claims: Claims, tab: str):
    days = period(request)
    export = _tab_builders(request, claims, days)[tab]()["export"]
    if export is None:
        raise HTTPException(503)
    return days, export


@app.get("/{tab}/export.csv")
def export_csv(tab: str, request: Request, claims: Claims = Depends(manager)):
    if tab not in TAB_NAMES:
        raise HTTPException(404)
    _, (slug, _title, header, rows) = export_of(request, claims, tab)
    return appkit.csv_response(appkit.csv_filename(APP_ID, claims.htx_code, slug, metrics.vn_day(now())), header, rows)


@app.get("/{tab}/print", response_class=HTMLResponse)
def print_page(tab: str, request: Request, claims: Claims = Depends(manager)):
    if tab not in TAB_NAMES:
        raise HTTPException(404)
    days, (_slug, title, header, rows) = export_of(request, claims, tab)
    return render(request, "print.html", claims=None, days=days, here=TAB_HERE[tab], title=title, header=header, rows=rows,
                  htx=claims.htx_code, today=metrics.vn_day(now()))


@app.get("/parcels/{code}", response_class=HTMLResponse)
def parcel(code: str, request: Request, claims: Claims = Depends(manager)):
    if not pages.PARCEL_CODE.fullmatch(code):
        raise HTTPException(404)
    days = period(request)
    ctx = pages.parcel_page(core, auth_of(request), claims.htx_code, code, now(), days)
    if ctx is None:
        return message(request, 404, f"Không tìm thấy thửa {code} trong HTX của anh/chị.")
    return render(request, "parcel.html", claims=claims, current="parcels", here=f"/parcels/{code}", **ctx)
