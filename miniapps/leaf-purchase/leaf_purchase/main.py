# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Mini-app leaf-purchase: cán bộ ghi phiếu cân chè búp tươi, quản trị chốt kỳ và chi trả, nông hộ xem phiếu của mình.

The gateway strips /apps/leaf-purchase, so routes are /, /prices, /periods, /mine; every link, form and redirect
writes the prefix back, because the browser goes through the web proxy and the gateway. Writes are POST + 303.
"""
import logging
import os
import threading
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from uuid import UUID

from fastapi import Depends, FastAPI, Form, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException

from leaf_purchase import core_client, store
from leaf_purchase.claims import Claims, read_claims

PREFIX = "/apps/leaf-purchase"
THEMES = ("light", "dark")  # the shell passes ?theme=; without it /dxos-app.css follows the system setting
VN_TZ = timezone(timedelta(hours=7))  # Asia/Ho_Chi_Minh: UTC+7 with no DST since 1975, so no tzdata is needed
ERRORS = {401: "Cần đăng nhập để xem trang này.", 403: "Tài khoản của bạn không được vào trang này.",
          404: "Không có trang này.", 405: "Không có trang này.",
          503: "Hệ thống đang bận. Vui lòng thử lại sau ít phút."}
CORE_DOWN = "Không lấy được danh sách nông hộ từ hệ thống. Vui lòng tải lại trang sau ít phút."
NO_HOUSEHOLD = "Tài khoản của anh/chị chưa được gắn với nông hộ nào, nên chưa có phiếu cân. Vui lòng hỏi ban quản trị HTX."
# Fixed keys only: ?notice= never carries free text into the page.
NOTICES = {"saved": "Đã lưu phiếu cân.", "voided": "Đã huỷ phiếu cân.", "price": "Đã lưu giá.",
           "paid": "Đã ghi nhận chi trả.", "unchanged": "Không có gì thay đổi."}
DB_MAX_CONNECTIONS = 8  # the app role allows 10; leaves room for ./dxos install and an admin
DB_WAIT_S = 2
DB_SLOTS = threading.BoundedSemaphore(DB_MAX_CONNECTIONS)

log = logging.getLogger("leaf_purchase")
# The root path (PREFIX) is set on the server, `uvicorn --root-path /apps/leaf-purchase`: FastAPI deprecated its own.
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


def href(path: str, theme: str = "", **params) -> str:
    query = {**params, **({"theme": theme} if theme else {})}
    return f"{PREFIX}{path}" + (f"?{urlencode(query)}" if query else "")


def ticket_state(ticket: store.Ticket) -> str:
    if ticket.voided:
        return "Đã huỷ"
    return "Chưa chốt" if ticket.period_id is None else "Đã vào kỳ"


templates.env.globals.update(href=href, prefix=PREFIX, ticket_state=ticket_state)
templates.env.filters["vnd"] = lambda n: f"{n:,}".replace(",", ".") + " ₫"
templates.env.filters["kg"] = lambda n: f"{n:,.1f}".replace(",", "_").replace(".", ",").replace("_", ".")
templates.env.filters["vn_date"] = lambda d: d.strftime("%d/%m/%Y")
templates.env.filters["vn_time"] = lambda t: t.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M")


def page(request: Request, name: str, status: int = 200, **context) -> HTMLResponse:
    theme = request.query_params.get("theme", "")
    return templates.TemplateResponse(request, name, {"theme": theme if theme in THEMES else "", **context},
                                      status_code=status)


def message(request: Request, status: int, text: str) -> HTMLResponse:
    return page(request, "message.html", status, message=text)


def redirect(request: Request, path: str, **params) -> RedirectResponse:
    theme = request.query_params.get("theme", "")
    return RedirectResponse(href(path, theme if theme in THEMES else "", **params), status_code=303)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return message(request, exc.status_code, ERRORS.get(exc.status_code, "Có lỗi xảy ra."))


@app.exception_handler(RequestValidationError)
async def bad_path(request: Request, exc: RequestValidationError):
    # Only path ids are typed (form fields are read as text), so a validation error is a page that does not exist.
    return message(request, 404, ERRORS[404])


@app.exception_handler(Exception)
async def server_error(request: Request, exc: Exception):
    # Starlette re-raises after this response, so uvicorn still logs the traceback; the user never sees it.
    return message(request, 500, "Có lỗi xảy ra. Vui lòng thử lại sau.")


def signed_in(authorization: str | None = Header(None)) -> Claims:
    claims = read_claims(authorization)
    if claims is None:
        raise HTTPException(401)
    return claims


def role(*names: str):
    """The gateway already checks the role per prefix; this keeps the app safe if a route is ever widened."""
    def check(claims: Claims = Depends(signed_in)) -> Claims:
        if not any(name in claims.roles for name in names) or not claims.htx_code:
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


def parse_date(raw: str) -> date | None:
    try:
        return date.fromisoformat(raw.strip())
    except ValueError:
        return None


def parse_price(raw: str) -> int | None:
    raw = raw.strip()
    return int(raw) if raw.isascii() and raw.isdigit() and len(raw) <= 9 else None


def today() -> date:
    return datetime.now(VN_TZ).date()


def notice_of(request: Request) -> str | None:
    return NOTICES.get(request.query_params.get("notice", ""))


# ---------- Tickets (officer, manager) ----------
# Handlers that call the core fetch households first and only then open a connection, so a slow core
# (up to 5 s) never holds one of the few database slots.

staff = role("officer", "manager")
manager = role("manager")


def households_or_error(authorization: str, claims: Claims) -> tuple[list[core_client.Household], str | None]:
    # Hasura applies the role to the household list, so the caller's own role is the one to ask with.
    try:
        return core_client.list_households(authorization, "manager" if "manager" in claims.roles else "officer"), None
    except core_client.CoreError as exc:
        log.warning("Households unavailable: %s", exc)
        return [], CORE_DOWN


def home_page(request, conn, claims, households, core_error, day, status=200, errors=(), form=None):
    tickets = store.tickets_on(conn, claims.htx_code, day)
    counted = [t for t in tickets if not t.voided]
    form = form or {"household": "", "weighed_on": day.isoformat(), "grade": "", "kg": ""}
    return page(request, "home.html", status, day=day, tickets=tickets, kg_total=sum(t.kg for t in counted),
                vnd_total=sum(t.amount_vnd for t in counted), households=households, core_error=core_error,
                grades=store.list_grades(conn, claims.htx_code, active_only=True), errors=errors, form=form,
                notice=notice_of(request))


@app.get("/")
def home(request: Request, claims: Claims = Depends(staff), authorization: str = Header(), day: str = ""):
    households, core_error = households_or_error(authorization, claims)
    with open_db() as conn:
        return home_page(request, conn, claims, households, core_error, parse_date(day) or today())


def ticket_form(household: str = Form(""), weighed_on: str = Form(""), grade: str = Form(""),
                kg: str = Form("")) -> dict:
    return {"household": household, "weighed_on": weighed_on, "grade": grade, "kg": kg}


def read_ticket_form(form: dict, households, core_error) -> tuple[dict, list[str]]:
    """Validated values for store.add_ticket / store.edit_ticket, and the Vietnamese errors."""
    errors = []
    chosen = next((h for h in households if h.id == form["household"]), None)
    if core_error:
        errors.append(core_error)
    elif chosen is None:
        errors.append("Hộ giao chè phải là một nông hộ của HTX.")
    day = parse_date(form["weighed_on"])
    if day is None:
        errors.append("Ngày cân không hợp lệ.")
    kg = store.parse_kg(form["kg"])
    if kg is None:
        errors.append("Số ký phải lớn hơn 0 và tối đa 5000, một chữ số lẻ (ví dụ 12,5).")
    try:
        grade = UUID(form["grade"])
    except ValueError:
        grade = None
        errors.append("Hãy chọn loại chè.")
    if errors:
        return {}, errors
    return {"household_id": chosen.id, "household_name": chosen.name, "weighed_on": day, "grade_id": grade,
            "kg": kg}, []


@app.post("/tickets")
def create_ticket(request: Request, claims: Claims = Depends(staff), authorization: str = Header(),
                  form: dict = Depends(ticket_form)):
    households, core_error = households_or_error(authorization, claims)
    values, errors = read_ticket_form(form, households, core_error)
    with open_db() as conn:
        if not errors:
            result = store.add_ticket(conn, claims.htx_code, **values, created_by=claims.sub)
            if not isinstance(result, store.TicketRefusal):
                return redirect(request, "/", day=values["weighed_on"].isoformat(), notice="saved")
            errors = [result.message]
        return home_page(request, conn, claims, households, core_error, parse_date(form["weighed_on"]) or today(),
                         400, errors, form)


def editable_grades(conn, htx_code: str, ticket: store.Ticket) -> list[store.Grade]:
    # A grade switched off since the ticket was written stays selectable for that ticket.
    return [g for g in store.list_grades(conn, htx_code) if g.active or g.id == ticket.grade_id]


def edit_page(request, ticket, households, core_error, grades, status=200, errors=(), form=None):
    form = form or {"household": ticket.household_id, "weighed_on": ticket.weighed_on.isoformat(),
                    "grade": str(ticket.grade_id), "kg": f"{ticket.kg:.1f}".replace(".", ",")}
    return page(request, "edit.html", status, ticket=ticket, households=households, core_error=core_error,
                grades=grades, errors=errors, form=form)


def get_ticket_or_404(conn, htx_code: str, ticket_id: UUID) -> store.Ticket:
    ticket = store.get_ticket(conn, htx_code, ticket_id)
    if ticket is None:
        raise HTTPException(404)
    return ticket


@app.get("/tickets/{ticket_id}/edit")
def edit_ticket_form(request: Request, ticket_id: UUID, claims: Claims = Depends(staff),
                     authorization: str = Header()):
    households, core_error = households_or_error(authorization, claims)
    with open_db() as conn:
        ticket = get_ticket_or_404(conn, claims.htx_code, ticket_id)
        if not ticket.open:
            return message(request, 409, store.TicketRefusal.CLOSED.message)
        grades = editable_grades(conn, claims.htx_code, ticket)
    return edit_page(request, ticket, households, core_error, grades)


@app.post("/tickets/{ticket_id}/edit")
def edit_ticket(request: Request, ticket_id: UUID, claims: Claims = Depends(staff), authorization: str = Header(),
                form: dict = Depends(ticket_form)):
    households, core_error = households_or_error(authorization, claims)
    values, errors = read_ticket_form(form, households, core_error)
    with open_db() as conn:
        ticket = get_ticket_or_404(conn, claims.htx_code, ticket_id)
        if not ticket.open:
            return message(request, 409, store.TicketRefusal.CLOSED.message)
        if not errors:
            refusal = store.edit_ticket(conn, claims.htx_code, ticket_id, **values)
            if refusal is None:
                return redirect(request, "/", day=values["weighed_on"].isoformat(), notice="saved")
            if refusal is store.TicketRefusal.CLOSED:
                return message(request, 409, refusal.message)
            errors = [refusal.message]
        grades = editable_grades(conn, claims.htx_code, ticket)
    return edit_page(request, ticket, households, core_error, grades, 400, errors, form)


@app.post("/tickets/{ticket_id}/void")
def void_ticket(request: Request, ticket_id: UUID, claims: Claims = Depends(staff), conn=Depends(db)):
    ticket = get_ticket_or_404(conn, claims.htx_code, ticket_id)
    refusal = store.void_ticket(conn, claims.htx_code, ticket_id)
    if refusal is store.TicketRefusal.NOT_FOUND:
        raise HTTPException(404)
    if refusal is not None:
        return message(request, 409, refusal.message)
    return redirect(request, "/", day=ticket.weighed_on.isoformat(), notice="voided")


# ---------- Prices (manager) ----------

PRICE_ERROR = "Giá phải là số đồng mỗi ký, không âm."


def prices_page(request, conn, claims, status=200, errors=(), form=None):
    return page(request, "prices.html", status, grades=store.list_grades(conn, claims.htx_code), errors=errors,
                form=form or {"name": "", "price_vnd": ""}, notice=notice_of(request))


@app.get("/prices")
def prices(request: Request, claims: Claims = Depends(manager), conn=Depends(db)):
    return prices_page(request, conn, claims)


@app.post("/prices")
def add_grade(request: Request, claims: Claims = Depends(manager), conn=Depends(db), name: str = Form(""),
              price_vnd: str = Form("")):
    form = {"name": name, "price_vnd": price_vnd}
    name, price = name.strip(), parse_price(price_vnd)
    errors = []
    if not 1 <= len(name) <= 60:
        errors.append("Tên loại chè cần từ 1 đến 60 ký tự.")
    if price is None:
        errors.append(PRICE_ERROR)
    if not errors and not store.add_grade(conn, claims.htx_code, name, price):
        errors.append("HTX đã có loại chè tên này.")
    if errors:
        return prices_page(request, conn, claims, 400, errors, form)
    return redirect(request, "/prices", notice="price")


@app.post("/prices/{grade_id}")
def update_grade(request: Request, grade_id: UUID, claims: Claims = Depends(manager), conn=Depends(db),
                 price_vnd: str = Form(""), active: str = Form("")):
    price = parse_price(price_vnd)
    if price is None:
        return prices_page(request, conn, claims, 400, [PRICE_ERROR])
    if not store.update_grade(conn, claims.htx_code, grade_id, price, bool(active)):
        raise HTTPException(404)
    return redirect(request, "/prices", notice="price")


# ---------- Periods (manager) ----------

def periods_page(request, conn, claims, status=200, errors=(), form=None):
    return page(request, "periods.html", status, periods=store.list_periods(conn, claims.htx_code), errors=errors,
                form=form or {"date_from": "", "date_to": ""})


@app.get("/periods")
def periods(request: Request, claims: Claims = Depends(manager), conn=Depends(db)):
    return periods_page(request, conn, claims)


@app.post("/periods")
def close_period(request: Request, claims: Claims = Depends(manager), conn=Depends(db), date_from: str = Form(""),
                 date_to: str = Form("")):
    form = {"date_from": date_from, "date_to": date_to}
    start, end = parse_date(date_from), parse_date(date_to)
    if start is None or end is None or start > end:
        return periods_page(request, conn, claims, 400,
                            ["Khoảng ngày không hợp lệ: ngày bắt đầu phải trước hoặc bằng ngày kết thúc."], form)
    result = store.close_period(conn, claims.htx_code, start, end, claims.sub)
    if isinstance(result, store.PeriodRefusal):
        return periods_page(request, conn, claims, 409, [result.message], form)
    return redirect(request, f"/periods/{result}")


@app.get("/periods/{period_id}")
def period_detail(request: Request, period_id: UUID, claims: Claims = Depends(manager), conn=Depends(db)):
    period = store.get_period(conn, claims.htx_code, period_id)
    if period is None:
        raise HTTPException(404)
    return page(request, "period.html", period=period, payouts=store.list_payouts(conn, claims.htx_code, period_id),
                notice=notice_of(request))


@app.post("/periods/{period_id}/payouts/{payout_id}/paid")
def pay(request: Request, period_id: UUID, payout_id: UUID, claims: Claims = Depends(manager), conn=Depends(db)):
    marked = store.mark_paid(conn, claims.htx_code, period_id, payout_id, claims.sub)
    if marked is None:
        raise HTTPException(404)
    return redirect(request, f"/periods/{period_id}", notice="paid" if marked else "unchanged")


# ---------- Farmer ----------

@app.get("/mine")
def mine(request: Request, claims: Claims = Depends(role("farmer")), authorization: str = Header()):
    try:
        households = core_client.list_households(authorization, "farmer")
    except core_client.CoreError as exc:
        log.warning("Households unavailable: %s", exc)
        return message(request, 503, CORE_DOWN)
    if not households:
        return page(request, "mine.html", household=None, notice_text=NO_HOUSEHOLD, tickets=[], payouts=[])
    household = households[0]  # Hasura returns only the farmer's own household; queries are bound to it and the HTX
    with open_db() as conn:
        return page(request, "mine.html", household=household, notice_text=None,
                    tickets=store.household_tickets(conn, claims.htx_code, household.id),
                    payouts=store.household_payouts(conn, claims.htx_code, household.id))
