# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Mini-app farm-supply: ban quản trị mở đợt mua chung vật tư, nông hộ đăng ký số lượng, ban quản trị tổng hợp theo hộ.

The gateway strips /apps/farm-supply, so routes are /, /rounds/..., /mine; every link, form and redirect writes
the prefix back, because the browser goes through the web proxy and the gateway. Writes are POST + 303.
"""
import logging
import os
import re
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlencode
from uuid import UUID

from fastapi import Depends, FastAPI, Form, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException

from farm_supply import core_client, store
from farm_supply.claims import Claims, read_claims

PREFIX = "/apps/farm-supply"
THEMES = ("light", "dark")  # the shell passes ?theme=; without it /dxos-app.css follows the system setting
VN_TZ = timezone(timedelta(hours=7))  # Asia/Ho_Chi_Minh: UTC+7 with no DST since 1975, so no tzdata is needed
ERRORS = {401: "Cần đăng nhập để xem trang này.", 403: "Tài khoản của bạn không được vào trang này.",
          404: "Không có trang này.", 405: "Không có trang này.",
          503: "Hệ thống đang bận. Vui lòng thử lại sau ít phút."}
CORE_DOWN = "Không lấy được thông tin nông hộ từ hệ thống. Vui lòng tải lại trang sau ít phút."
NO_HOUSEHOLD = "Tài khoản của bạn chưa được gắn với nông hộ nào. Vui lòng liên hệ ban quản trị HTX."
BAD_QUANTITY = "Số lượng phải là số từ 0 đến 10.000, tối đa một chữ số thập phân (ví dụ 2,5)."
# Fixed keys only: ?notice= never carries free text into the page.
NOTICES = {"saved": "Đã lưu thay đổi.", "marked": "Đã ghi nhận."}
DB_MAX_CONNECTIONS = 8  # the app role allows 10; leaves room for ./dxos install and an admin
DB_WAIT_S = 2
DB_SLOTS = threading.BoundedSemaphore(DB_MAX_CONNECTIONS)
QUANTITY_RE = re.compile(r"[0-9]{1,5}(?:[.,][0-9])?")
MAX_QUANTITY = Decimal(10000)

log = logging.getLogger("farm_supply")
# The root path (PREFIX) is set on the server, `uvicorn --root-path /apps/farm-supply`: FastAPI deprecated its own.
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


def href(path: str, theme: str = "", **params) -> str:
    query = {**params, **({"theme": theme} if theme else {})}
    return f"{PREFIX}{path}" + (f"?{urlencode(query)}" if query else "")


def round_status(r: store.Round) -> str:
    if r.status == "CLOSED":
        return "Đã đóng"
    return "Đang nhận đăng ký" if r.accepting else "Hết hạn, chờ đóng đợt"


def settlement_status(line) -> str:
    if line.status == "OPEN":
        return "Chờ đóng đợt"
    if line.paid_at:
        return "Đã thanh toán"
    return "Đã giao, chờ thanh toán" if line.delivered_at else "Chờ giao hàng"


templates.env.globals.update(href=href, prefix=PREFIX, round_status=round_status, settlement_status=settlement_status)
templates.env.filters["vnd"] = lambda n: f"{n:,}".replace(",", ".") + " ₫"
templates.env.filters["vn_time"] = lambda t: t.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M")
templates.env.filters["qty"] = lambda q: f"{q:f}".removesuffix(".0")


def page(request: Request, name: str, status: int = 200, **context) -> HTMLResponse:
    theme = request.query_params.get("theme", "")
    return templates.TemplateResponse(request, name, {"theme": theme if theme in THEMES else "", **context},
                                      status_code=status)


def redirect(request: Request, path: str, **params) -> RedirectResponse:
    theme = request.query_params.get("theme", "")
    return RedirectResponse(href(path, theme if theme in THEMES else "", **params), status_code=303)


def refused(request: Request, refusal: store.Refusal) -> HTMLResponse:
    if refusal is store.Refusal.NOT_FOUND:
        raise HTTPException(404)
    return page(request, "message.html", 409, message=refusal.message)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return page(request, "message.html", exc.status_code, message=ERRORS.get(exc.status_code, "Có lỗi xảy ra."))


@app.exception_handler(RequestValidationError)
async def bad_path(request: Request, exc: RequestValidationError):
    # Only path ids are typed (form fields are read as text), so a validation error is a page that does not exist.
    return page(request, "message.html", 404, message=ERRORS[404])


@app.exception_handler(Exception)
async def server_error(request: Request, exc: Exception):
    # Starlette re-raises after this response, so uvicorn still logs the traceback; the user never sees it.
    return page(request, "message.html", 500, message="Có lỗi xảy ra. Vui lòng thử lại sau.")


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


@app.get("/healthz", response_class=PlainTextResponse)
def healthz():
    return "ok"


def parse_int(raw: str) -> int | None:
    raw = raw.strip()
    return int(raw) if raw.isascii() and raw.isdigit() and len(raw) <= 9 else None


def parse_quantity(raw: str) -> Decimal | None:
    """0 for blank (no request); a number up to 10000 with at most one decimal, comma or dot; None otherwise."""
    raw = raw.strip()
    if not raw:
        return Decimal(0)
    if not QUANTITY_RE.fullmatch(raw):
        return None
    quantity = Decimal(raw.replace(",", "."))
    return quantity if quantity <= MAX_QUANTITY else None


# ---------- Manager ----------

def manager_home_page(request, conn, claims, status=200, errors=(), form=None):
    return page(request, "manager.html", status, htx=claims.htx_code, rounds=store.list_rounds(conn, claims.htx_code),
                errors=errors, form=form or {})


@app.get("/")
def manager_home(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    return manager_home_page(request, conn, claims)


@app.post("/rounds")
def create_round(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db),
                 title: str = Form(""), deadline: str = Form("")):
    form, title = {"title": title, "deadline": deadline}, title.strip()
    errors = []
    if not 1 <= len(title) <= 120:
        errors.append("Tên đợt cần từ 1 đến 120 ký tự.")
    try:
        limit = datetime.fromisoformat(deadline)
        limit = limit if limit.tzinfo else limit.replace(tzinfo=VN_TZ)
    except ValueError:
        limit = None
    if limit is None or limit <= datetime.now(VN_TZ):
        errors.append("Hạn đăng ký phải là một ngày giờ trong tương lai.")
    if errors:
        return manager_home_page(request, conn, claims, 400, errors, form)
    return redirect(request, f"/rounds/{store.create_round(conn, claims.htx_code, title, limit)}")


@app.get("/rounds/{round_id}")
def round_detail(request: Request, round_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    found = store.get_round(conn, claims.htx_code, round_id)
    if found is None:
        raise HTTPException(404)
    items = store.item_lines(conn, claims.htx_code, round_id)
    return page(request, "round.html", round=found, items=items, total=sum(i.amount_vnd for i in items),
                households=store.household_summary(conn, claims.htx_code, round_id),
                notice=NOTICES.get(request.query_params.get("notice", "")))


def read_item(name: str, unit: str, price_vnd: str) -> tuple[tuple, list[str]]:
    name, unit, price = name.strip(), unit.strip(), parse_int(price_vnd)
    errors = []
    if not 1 <= len(name) <= 120:
        errors.append("Tên mặt hàng cần từ 1 đến 120 ký tự.")
    if not 1 <= len(unit) <= 20:
        errors.append("Đơn vị tính cần từ 1 đến 20 ký tự.")
    if price is None:
        errors.append("Đơn giá phải là số đồng, không âm.")
    return (name, unit, price), errors


def item_error_page(request, errors):
    return page(request, "message.html", 400, message=" ".join(errors))


@app.post("/rounds/{round_id}/items")
def add_item(request: Request, round_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db),
             name: str = Form(""), unit: str = Form(""), price_vnd: str = Form("")):
    values, errors = read_item(name, unit, price_vnd)
    if errors:
        return item_error_page(request, errors)
    refusal = store.add_item(conn, claims.htx_code, round_id, *values)
    return refused(request, refusal) if refusal else redirect(request, f"/rounds/{round_id}", notice="saved")


@app.post("/items/{item_id}/edit")
def edit_item(request: Request, item_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db),
              name: str = Form(""), unit: str = Form(""), price_vnd: str = Form("")):
    values, errors = read_item(name, unit, price_vnd)
    if errors:
        return item_error_page(request, errors)
    round_id, refusal = store.edit_item(conn, claims.htx_code, item_id, *values)
    return refused(request, refusal) if refusal else redirect(request, f"/rounds/{round_id}", notice="saved")


@app.post("/rounds/{round_id}/close")
def close_round(request: Request, round_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    if not store.close_round(conn, claims.htx_code, round_id):
        raise HTTPException(404)
    return redirect(request, f"/rounds/{round_id}")


@app.post("/rounds/{round_id}/settlements/{household_id}/{kind}")
def mark_settlement(request: Request, round_id: UUID, household_id: str, kind: str,
                    claims: Claims = Depends(role("manager")), conn=Depends(db)):
    if kind not in store.MARKS:
        raise HTTPException(404)
    refusal = store.mark(conn, claims.htx_code, round_id, household_id, kind)
    return refused(request, refusal) if refusal else redirect(request, f"/rounds/{round_id}", notice="marked")


# ---------- Farmer ----------
# The household comes only from Hasura with the farmer's own token (never from the form), and is fetched before a
# database connection is taken, so a slow core (up to 5 s) never holds one of the few slots.

def own_household(authorization: str) -> tuple[core_client.Household | None, str | None]:
    try:
        households = core_client.list_households(authorization, "farmer")
    except core_client.CoreError as exc:
        log.warning("Household unavailable: %s", exc)
        return None, CORE_DOWN
    return (households[0] if households else None), None


def mine_page(request, conn, claims, household, status=200, error=None, typed=None):
    items = store.my_items(conn, claims.htx_code, household.id)
    rounds = store.open_rounds(conn, claims.htx_code)
    return page(request, "mine.html", status, household=household, rounds=rounds, error=error, typed=typed or {},
                items={r.id: [i for i in items if i.round_id == r.id] for r in rounds},
                history=store.my_history(conn, claims.htx_code, household.id),
                notice=NOTICES.get(request.query_params.get("notice", "")))


@app.get("/mine")
def mine(request: Request, claims: Claims = Depends(role("farmer")), authorization: str = Header()):
    household, core_error = own_household(authorization)
    if household is None:
        return page(request, "mine.html", household=None, problem=core_error or NO_HOUSEHOLD)
    with open_db() as conn:
        return mine_page(request, conn, claims, household)


async def quantity_fields(request: Request) -> dict[str, str]:
    form = await request.form()
    return {k.removeprefix("q_"): v for k, v in form.items() if k.startswith("q_") and isinstance(v, str)}


@app.post("/mine/rounds/{round_id}")
def register(request: Request, round_id: UUID, claims: Claims = Depends(role("farmer")),
             authorization: str = Header(), fields: dict = Depends(quantity_fields)):
    household, core_error = own_household(authorization)
    if household is None:
        return page(request, "message.html", 503 if core_error else 409, message=core_error or NO_HOUSEHOLD)
    quantities = {}
    for key, raw in fields.items():
        try:
            item_id, quantity = UUID(key), parse_quantity(raw)
        except ValueError:
            continue
        if quantity is None:
            with open_db() as conn:
                return mine_page(request, conn, claims, household, 400, BAD_QUANTITY, fields)
        quantities[item_id] = quantity
    with open_db() as conn:
        refusal = store.register(conn, claims.htx_code, round_id, household.id, household.name, quantities)
    return refused(request, refusal) if refusal else redirect(request, "/mine", notice="saved")
