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
from decimal import ROUND_HALF_UP, Decimal
from itertools import groupby
from pathlib import Path
from urllib.parse import urlencode
from uuid import UUID

from fastapi import Depends, FastAPI, Form, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException

from farm_supply import appkit, core_client, store
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


def round_tone(r: store.Round) -> str:
    """Pill tone: green while taking registrations, grey once closed or past the deadline."""
    return "" if r.status == "OPEN" and r.accepting else " neutral"


def settlement_tone(line) -> str:
    """Green when done; amber for a household still to be delivered or to pay in a closed round; grey while open."""
    if line.status == "OPEN":
        return " neutral"
    return "" if line.paid_at else " warn"


def settlement_status(line) -> str:
    if line.status == "OPEN":
        return "Chờ đóng đợt"
    if line.paid_at:
        return "Đã thanh toán"
    return "Đã giao, chờ thanh toán" if line.delivered_at else "Chờ giao hàng"


templates.env.globals.update(href=href, prefix=PREFIX, round_status=round_status, round_tone=round_tone,
                         settlement_status=settlement_status, settlement_tone=settlement_tone)
templates.env.filters["vnd"] = lambda n: f"{n:,}".replace(",", ".") + " ₫"
templates.env.filters["vn_time"] = lambda t: t.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M")
templates.env.filters["qty"] = lambda q: f"{q:f}".removesuffix(".0")
templates.env.globals.update(number=appkit.number)
MANAGER_TABS = (("rounds", "Đợt đăng ký", "/"),)
FARMER_TABS = (("mine", "Đăng ký vật tư", "/mine"),)
STEPS = ("Nhận đăng ký", "Đã đóng đợt", "Đã giao đủ", "Đã thu đủ")


def tabs_for(theme: str, tabs) -> list[tuple[str, str, str]]:
    return [(key, label, href(path, theme)) for key, label, path in tabs]


def theme_of(request: Request) -> str:
    theme = request.query_params.get("theme", "")
    return theme if theme in THEMES else ""


def list_href(path: str, theme: str, **params) -> str:
    """A list address that keeps the filter and the page, and leaves out what is default."""
    return href(path, theme, **{k: v for k, v in params.items() if v not in ("", None, 1)})


def page_links(path: str, theme: str, paging: appkit.Page, **filters) -> tuple[str | None, str | None]:
    prev_href = list_href(path, theme, **filters, page=paging.number - 1) if paging.has_prev else None
    next_href = list_href(path, theme, **filters, page=paging.number + 1) if paging.has_next else None
    return prev_href, next_href


def today():
    return datetime.now(VN_TZ).date()


def page(request: Request, name: str, status: int = 200, **context) -> HTMLResponse:
    return templates.TemplateResponse(request, name, {"theme": theme_of(request), **context}, status_code=status)


def redirect(request: Request, path: str, **params) -> RedirectResponse:
    return RedirectResponse(href(path, theme_of(request), **params), status_code=303)


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

def manager_home_page(request, conn, claims, status=200, errors=None, form=None):
    theme = theme_of(request)
    wanted = request.query_params.get("status", "")
    shown = wanted if wanted in store.STATUS_FILTERS else ""
    db_status = store.STATUS_FILTERS.get(shown)
    paging = appkit.page_of(request.query_params.get("page"), store.count_rounds(conn, claims.htx_code, db_status))
    return page(request, "manager.html", status, htx=claims.htx_code, overview=store.overview(conn, claims.htx_code),
                rounds=store.list_round_rows(conn, claims.htx_code, db_status, paging.size, paging.offset),
                paging=paging, shown=shown, links=page_links("/", theme, paging, status=shown),
                tabs=tabs_for(theme, MANAGER_TABS), errors=errors or {}, form=form or {})


@app.get("/")
def manager_home(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    return manager_home_page(request, conn, claims)


@app.post("/rounds")
def create_round(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db),
                 title: str = Form(""), deadline: str = Form("")):
    form, title = {"title": title, "deadline": deadline}, title.strip()
    errors = {}
    if not 1 <= len(title) <= 120:
        errors["title"] = "Tên đợt cần từ 1 đến 120 ký tự."
    try:
        limit = datetime.fromisoformat(deadline)
        limit = limit if limit.tzinfo else limit.replace(tzinfo=VN_TZ)
    except ValueError:
        limit = None
    if limit is None or limit <= datetime.now(VN_TZ):
        errors["deadline"] = "Hạn đăng ký phải là một ngày giờ trong tương lai."
    if errors:
        return manager_home_page(request, conn, claims, 400, errors, form)
    return redirect(request, f"/rounds/{store.create_round(conn, claims.htx_code, title, limit)}")


def round_step(found: store.Round, households) -> int:
    if found.status == "OPEN":
        return 0
    if households and all(h.delivered_at for h in households):
        return 3 if all(h.paid_at for h in households) else 2
    return 1


def round_page(request, conn, claims, found, status=200, item_form=None):
    """The round page; item_form is the add/edit form that was refused, with its errors and the typed values."""
    theme = theme_of(request)
    items = store.item_lines(conn, claims.htx_code, found.id)
    total = sum(i.amount_vnd for i in items)
    households = store.household_summary(conn, claims.htx_code, found.id)
    return page(request, "round.html", status, round=found, items=items, total=total, households=households,
                chart=appkit.chart_rows([(i.name, i.amount_vnd) for i in items], appkit.money) if total else [],
                step=round_step(found, households), steps=STEPS, tabs=tabs_for(theme, MANAGER_TABS),
                item_form=item_form or {"target": "", "errors": {}, "typed": {}}, notice=NOTICES.get(request.query_params.get("notice", "")))


def find_round(conn, claims, round_id: UUID) -> store.Round:
    found = store.get_round(conn, claims.htx_code, round_id)
    if found is None:
        raise HTTPException(404)
    return found


@app.get("/rounds/{round_id}")
def round_detail(request: Request, round_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    return round_page(request, conn, claims, find_round(conn, claims, round_id))


@app.get("/rounds/{round_id}/items/export.csv")
def export_items(round_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    find_round(conn, claims, round_id)
    rows = [(i.name, i.unit, i.price_vnd, i.request_count, f"{i.total_quantity:f}".removesuffix(".0"), i.amount_vnd)
            for i in store.item_lines(conn, claims.htx_code, round_id)]
    return appkit.csv_response(appkit.csv_filename("farm-supply", claims.htx_code, "items", today()),
                               ("Mặt hàng", "Đơn vị", "Đơn giá", "Số hộ", "Tổng số lượng", "Thành tiền"), rows)


@app.get("/rounds/{round_id}/households/export.csv")
def export_households(round_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    find_round(conn, claims, round_id)
    rows = [(h.household_name, h.amount_vnd, appkit.vn_datetime(h.delivered_at) if h.delivered_at else "",
             appkit.vn_datetime(h.paid_at) if h.paid_at else "")
            for h in store.household_summary(conn, claims.htx_code, round_id)]
    return appkit.csv_response(appkit.csv_filename("farm-supply", claims.htx_code, "households", today()),
                               ("Hộ", "Thành tiền", "Đã giao", "Đã trả tiền"), rows)


@app.get("/rounds/{round_id}/print")
def print_sheet(request: Request, round_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    found = find_round(conn, claims, round_id)
    lines = store.print_lines(conn, claims.htx_code, round_id)
    sheet = []
    for _, group in groupby(lines, key=lambda line: line.household_id):
        group = list(group)
        sheet.append({"name": group[0].household_name, "lines": group, "total": sum(line.amount_vnd for line in group)})
    return page(request, "print.html", round=found, sheet=sheet, htx=claims.htx_code,
                printed=appkit.vn_date(today()), back=appkit.shell_url("manager", "farm-supply", f"/rounds/{round_id}"))


def read_item(name: str, unit: str, price_vnd: str) -> tuple[tuple, dict[str, str]]:
    name, unit, price = name.strip(), unit.strip(), parse_int(price_vnd)
    errors = {}
    if not 1 <= len(name) <= 120:
        errors["name"] = "Tên mặt hàng cần từ 1 đến 120 ký tự."
    if not 1 <= len(unit) <= 20:
        errors["unit"] = "Đơn vị tính cần từ 1 đến 20 ký tự."
    if price is None:
        errors["price_vnd"] = "Đơn giá phải là số đồng, không âm."
    return (name, unit, price), errors


@app.post("/rounds/{round_id}/items")
def add_item(request: Request, round_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db),
             name: str = Form(""), unit: str = Form(""), price_vnd: str = Form("")):
    found = find_round(conn, claims, round_id)
    values, errors = read_item(name, unit, price_vnd)
    if errors:
        typed = {"name": name, "unit": unit, "price_vnd": price_vnd}
        return round_page(request, conn, claims, found, 400, {"target": "new", "errors": errors, "typed": typed})
    refusal = store.add_item(conn, claims.htx_code, round_id, *values)
    return refused(request, refusal) if refusal else redirect(request, f"/rounds/{round_id}", notice="saved")


@app.post("/items/{item_id}/edit")
def edit_item(request: Request, item_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db),
              name: str = Form(""), unit: str = Form(""), price_vnd: str = Form("")):
    values, errors = read_item(name, unit, price_vnd)
    if errors:
        round_id = store.item_round(conn, claims.htx_code, item_id)
        if round_id is None:
            raise HTTPException(404)
        typed = {"name": name, "unit": unit, "price_vnd": price_vnd}
        return round_page(request, conn, claims, find_round(conn, claims, round_id), 400,
                          {"target": str(item_id), "errors": errors, "typed": typed})
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


def amount_of(items) -> int:
    """What a household owes for its quantities: the same round(quantity * price) per item as the database uses."""
    return sum(int((i.quantity * i.price_vnd).quantize(Decimal(1), rounding=ROUND_HALF_UP)) for i in items if i.quantity)


def mine_page(request, conn, claims, household, status=200, error=None, typed=None):
    theme = theme_of(request)
    items = store.my_items(conn, claims.htx_code, household.id)
    rounds = store.open_rounds(conn, claims.htx_code)
    by_round = {r.id: [i for i in items if i.round_id == r.id] for r in rounds}
    paging = appkit.page_of(request.query_params.get("page"), store.count_my_history(conn, claims.htx_code, household.id))
    return page(request, "mine.html", status, household=household, rounds=rounds, error=error, typed=typed or {},
                items=by_round, totals={rid: amount_of(rows) for rid, rows in by_round.items()},
                history=store.my_history(conn, claims.htx_code, household.id, paging.size, paging.offset),
                paging=paging, links=page_links("/mine", theme, paging), tabs=tabs_for(theme, FARMER_TABS),
                notice=NOTICES.get(request.query_params.get("notice", "")))


@app.get("/mine")
def mine(request: Request, claims: Claims = Depends(role("farmer")), authorization: str = Header()):
    household, core_error = own_household(authorization)
    if household is None:
        return page(request, "mine.html", household=None, problem=core_error or NO_HOUSEHOLD,
                    tabs=tabs_for(theme_of(request), FARMER_TABS))
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
