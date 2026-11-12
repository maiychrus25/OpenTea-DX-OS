# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Mini-app tea-tour: ban quản trị tạo tour đồi chè, khách đặt chỗ công khai, nông hộ xem lịch dẫn tour (spec §7).

The gateway strips /apps/tea-tour, so routes are /, /guide, /public/...; every link, form and redirect writes
the prefix back, because the browser goes through the web proxy and the gateway. Writes are POST + 303.
"""
import logging
import os
import re
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from uuid import UUID

from fastapi import Depends, FastAPI, Form, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException

from tea_tour import core_client, store
from tea_tour.claims import Claims, read_claims

PREFIX = "/apps/tea-tour"
THEMES = ("light", "dark")  # the shell passes ?theme=; without it /dxos-app.css follows the system setting
VN_TZ = timezone(timedelta(hours=7))  # Asia/Ho_Chi_Minh: UTC+7 with no DST since 1975, so no tzdata is needed
HTX_RE = re.compile(r"[A-Za-z0-9_-]{1,32}")
ERRORS = {401: "Cần đăng nhập để xem trang này.", 403: "Tài khoản của bạn không được vào trang này.",
          404: "Không có trang này.", 405: "Không có trang này.",
          503: "Hệ thống đang bận. Vui lòng thử lại sau ít phút."}
BOOKING_STATUS = {"PENDING": "Chờ xác nhận", "CONFIRMED": "Đã xác nhận", "CANCELLED": "Đã huỷ"}
CORE_DOWN = "Không lấy được danh sách nông hộ từ hệ thống. Vui lòng tải lại trang sau ít phút."
NOT_FOUND_BOOKING = "Không tìm thấy lượt đặt với mã và số điện thoại này."
# Fixed keys only: ?notice= never carries free text into the page.
NOTICES = {"unchanged": "Không có gì thay đổi: lượt đặt đã được xử lý trước đó, hoặc tour đã huỷ.",
           "saved": "Đã lưu thay đổi của tour."}
DB_MAX_CONNECTIONS = 8  # the app role allows 10; leaves room for ./dxos install and an admin
DB_WAIT_S = 2
DB_SLOTS = threading.BoundedSemaphore(DB_MAX_CONNECTIONS)

log = logging.getLogger("tea_tour")
# The root path (PREFIX) is set on the server, `uvicorn --root-path /apps/tea-tour`: FastAPI deprecated its own.
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


def href(path: str, theme: str = "", **params) -> str:
    query = {**params, **({"theme": theme} if theme else {})}
    return f"{PREFIX}{path}" + (f"?{urlencode(query)}" if query else "")


def tour_status(tour: store.Tour) -> str:
    if tour.status == "CANCELLED":
        return "Đã huỷ"
    return "Đã diễn ra" if tour.past else "Đang nhận khách"


templates.env.globals.update(href=href, prefix=PREFIX, booking_status=BOOKING_STATUS, tour_status=tour_status)
templates.env.filters["vnd"] = lambda n: f"{n:,}".replace(",", ".") + " ₫"
templates.env.filters["vn_time"] = lambda t: t.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M")


def page(request: Request, name: str, status: int = 200, **context) -> HTMLResponse:
    theme = request.query_params.get("theme", "")
    return templates.TemplateResponse(request, name, {"theme": theme if theme in THEMES else "", **context},
                                      status_code=status)


def redirect(request: Request, path: str, **params) -> RedirectResponse:
    theme = request.query_params.get("theme", "")
    return RedirectResponse(href(path, theme if theme in THEMES else "", **params), status_code=303)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return page(request, "message.html", exc.status_code, message=ERRORS.get(exc.status_code, "Có lỗi xảy ra."))


@app.exception_handler(RequestValidationError)
async def bad_path(request: Request, exc: RequestValidationError):
    # Only path ids are typed (form fields are read as text), so a validation error is a page that does not exist.
    return page(request, "message.html", 404, message=ERRORS[404])


@app.exception_handler(Exception)
async def server_error(request: Request, exc: Exception):
    # Starlette re-raises after this response, so uvicorn still logs the traceback; the guest never sees it.
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


def public_htx(htx: str) -> str:
    if not HTX_RE.fullmatch(htx):
        raise HTTPException(404)
    return htx


@app.get("/healthz", response_class=PlainTextResponse)
def healthz():
    return "ok"


# ---------- Manager ----------
# Handlers that call the core fetch households first and only then open a connection, so a slow core
# (up to 5 s) never holds one of the few database slots.

def households_or_error(authorization: str) -> tuple[list[core_client.Household], str | None]:
    try:
        return core_client.list_households(authorization), None
    except core_client.CoreError as exc:
        log.warning("Households unavailable: %s", exc)
        return [], CORE_DOWN


def manager_page(request, conn, claims, households, core_error, status=200, errors=(), form=None):
    return page(request, "manager.html", status, htx=claims.htx_code, tours=store.list_tours(conn, claims.htx_code),
                households=households, core_error=core_error, errors=errors, form=form or {})


@app.get("/")
def manager_home(request: Request, claims: Claims = Depends(role("manager")), authorization: str = Header()):
    households, core_error = households_or_error(authorization)
    with open_db() as conn:
        return manager_page(request, conn, claims, households, core_error)


def parse_int(raw: str) -> int | None:
    raw = raw.strip()
    return int(raw) if raw.isascii() and raw.isdigit() and len(raw) <= 9 else None


def tour_form(title: str = Form(""), starts_at: str = Form(""), meeting_point: str = Form(""), seats: str = Form(""),
              price_vnd: str = Form(""), description: str = Form(""), guide: str = Form("")) -> dict:
    return {"title": title, "starts_at": starts_at, "meeting_point": meeting_point, "seats": seats,
            "price_vnd": price_vnd, "description": description, "guide": guide}


def read_tour_form(form: dict, households: list[core_client.Household], core_error: str | None) -> tuple[dict, list]:
    """Validated values for store.create_tour / store.edit_tour, and the Vietnamese errors (create and edit alike)."""
    errors = []
    title, meeting_point = form["title"].strip(), form["meeting_point"].strip()
    description = form["description"].strip()
    if not 1 <= len(title) <= 120:
        errors.append("Tên tour cần từ 1 đến 120 ký tự.")
    try:
        start = datetime.fromisoformat(form["starts_at"])
        start = start if start.tzinfo else start.replace(tzinfo=VN_TZ)
    except ValueError:
        start = None
    if start is None or start <= datetime.now(VN_TZ):
        errors.append("Thời gian phải là một ngày giờ trong tương lai.")
    if not 1 <= len(meeting_point) <= 200:
        errors.append("Điểm hẹn cần từ 1 đến 200 ký tự.")
    seats = parse_int(form["seats"])
    if seats is None or not 1 <= seats <= 50:
        errors.append("Số chỗ phải từ 1 đến 50.")
    price = parse_int(form["price_vnd"])
    if price is None:
        errors.append("Giá phải là số đồng, không âm.")
    if len(description) > 2000:
        errors.append("Mô tả tối đa 2000 ký tự.")
    chosen = next((h for h in households if h.id == form["guide"]), None)
    if core_error:
        errors.append(core_error)
    elif chosen is None:
        errors.append("Người dẫn tour phải là một nông hộ của HTX.")
    if errors:
        return {}, errors
    return {"title": title, "starts_at": start, "meeting_point": meeting_point, "seats": seats, "price_vnd": price,
            "description": description or None, "guide_user_id": chosen.keycloak_user_id,
            "guide_name": chosen.name}, []


@app.post("/tours")
def create_tour(request: Request, claims: Claims = Depends(role("manager")), authorization: str = Header(),
                form: dict = Depends(tour_form)):
    households, core_error = households_or_error(authorization)
    values, errors = read_tour_form(form, households, core_error)
    with open_db() as conn:
        if errors:
            return manager_page(request, conn, claims, households, core_error, 400, errors, form)
        tour_id = store.create_tour(conn, claims.htx_code, **values)
    return redirect(request, f"/tours/{tour_id}")


@app.get("/tours/{tour_id}")
def tour_detail(request: Request, tour_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    tour = store.get_tour(conn, claims.htx_code, tour_id)
    if tour is None:
        raise HTTPException(404)
    return page(request, "tour.html", tour=tour, bookings=store.tour_bookings(conn, claims.htx_code, tour_id),
                notice=NOTICES.get(request.query_params.get("notice", "")))


def editable_tour(request, conn, htx_code: str, tour_id: UUID):
    """The tour, or the 404 / 409 response a cancelled or past tour gets instead of an edit form."""
    tour = store.get_tour(conn, htx_code, tour_id)
    if tour is None:
        raise HTTPException(404)
    if tour.status != "OPEN" or tour.past:
        return None, page(request, "message.html", 409, message=store.EditRefusal.CLOSED.message)
    return tour, None


def edit_page(request, tour, households, core_error, status=200, errors=(), form=None):
    if form is None:
        guide = next((h.id for h in households if tour.guide_user_id and h.keycloak_user_id == tour.guide_user_id),
                     next((h.id for h in households if h.name == tour.guide_name), ""))
        form = {"title": tour.title, "starts_at": tour.starts_at.astimezone(VN_TZ).strftime("%Y-%m-%dT%H:%M"),
                "meeting_point": tour.meeting_point, "seats": str(tour.seats), "price_vnd": str(tour.price_vnd),
                "description": tour.description or "", "guide": guide}
    return page(request, "edit.html", status, tour=tour, households=households, core_error=core_error,
                errors=errors, form=form)


@app.get("/tours/{tour_id}/edit")
def edit_tour_form(request: Request, tour_id: UUID, claims: Claims = Depends(role("manager")),
                   authorization: str = Header()):
    households, core_error = households_or_error(authorization)
    with open_db() as conn:
        tour, refused = editable_tour(request, conn, claims.htx_code, tour_id)
    return refused or edit_page(request, tour, households, core_error)


@app.post("/tours/{tour_id}/edit")
def edit_tour(request: Request, tour_id: UUID, claims: Claims = Depends(role("manager")),
              authorization: str = Header(), form: dict = Depends(tour_form)):
    households, core_error = households_or_error(authorization)
    values, errors = read_tour_form(form, households, core_error)
    with open_db() as conn:
        tour, refused = editable_tour(request, conn, claims.htx_code, tour_id)
        if refused:
            return refused
        if not errors:
            refusal = store.edit_tour(conn, claims.htx_code, tour_id, **values)
            if refusal is None:
                return redirect(request, f"/tours/{tour_id}", notice="saved")
            if refusal is store.EditRefusal.NOT_FOUND:
                raise HTTPException(404)
            if refusal is store.EditRefusal.CLOSED:
                return page(request, "message.html", 409, message=refusal.message)
            tour = store.get_tour(conn, claims.htx_code, tour_id)  # fresh seat count for the message
            errors = [f"Số chỗ không được ít hơn số chỗ khách đã đặt ({tour.seats_used})."]
    return edit_page(request, tour, households, core_error, 400, errors, form)


@app.post("/tours/{tour_id}/cancel")
def cancel_tour(request: Request, tour_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    if not store.cancel_tour(conn, claims.htx_code, tour_id):
        raise HTTPException(404)
    return redirect(request, f"/tours/{tour_id}")


def move_booking(request, conn, claims, booking_id, status, from_statuses, open_tour=False):
    moved = store.set_booking_status(conn, claims.htx_code, booking_id, status, from_statuses, open_tour)
    if moved is None:
        raise HTTPException(404)
    tour_id, changed = moved
    return redirect(request, f"/tours/{tour_id}", **({} if changed else {"notice": "unchanged"}))


@app.post("/bookings/{booking_id}/confirm")
def confirm_booking(request: Request, booking_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    # Only a pending booking of an open tour: confirming a cancelled booking would take seats back outside the
    # row lock of book(), and a cancelled tour takes no guests.
    return move_booking(request, conn, claims, booking_id, "CONFIRMED", ("PENDING",), open_tour=True)


@app.post("/bookings/{booking_id}/cancel")
def cancel_booking(request: Request, booking_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    return move_booking(request, conn, claims, booking_id, "CANCELLED", ("PENDING", "CONFIRMED"))


# ---------- Guide (farmer) ----------

@app.get("/guide")
def guide(request: Request, claims: Claims = Depends(role("farmer")), conn=Depends(db)):
    return page(request, "guide.html", tours=store.guide_tours(conn, claims.htx_code, claims.sub))


# ---------- Public (no token; never shows another guest's name or phone) ----------

def public_page(request, conn, htx, status=200, error=None, error_tour=None, form=None):
    tours = store.public_tours(conn, htx)
    if all(t.id != error_tour for t in tours):
        error_tour = None  # a tour no longer listed (cancelled, past, other HTX): the error goes at the top
    return page(request, "public.html", status, htx=htx, tours=tours, error=error, error_tour=error_tour,
                form=form or {})


@app.get("/public/{htx}")
def public_tours(request: Request, htx: str = Depends(public_htx), conn=Depends(db)):
    return public_page(request, conn, htx)


@app.post("/public/{htx}/tours/{tour_id}/book")
def public_book(request: Request, tour_id: UUID, htx: str = Depends(public_htx), conn=Depends(db),
                guest_name: str = Form(""), phone: str = Form(""), party_size: str = Form(""), note: str = Form("")):
    form = {"guest_name": guest_name, "phone": phone, "party_size": party_size, "note": note}
    guest_name, note = guest_name.strip(), note.strip()
    normalized, size = store.normalize_phone(phone), parse_int(party_size)
    errors = []
    if not 1 <= len(guest_name) <= 80:
        errors.append("Họ tên cần từ 1 đến 80 ký tự.")
    if normalized is None:
        errors.append("Số điện thoại cần đúng 10 số, bắt đầu bằng 0 (hoặc +84).")
    if size is None or not 1 <= size <= 10:
        errors.append("Số người phải từ 1 đến 10.")
    if len(note) > 500:
        errors.append("Ghi chú tối đa 500 ký tự.")
    if errors:
        return public_page(request, conn, htx, 400, " ".join(errors), tour_id, form)
    result = store.book(conn, htx, tour_id, guest_name, normalized, size, note or None)
    if isinstance(result, store.BookingRefusal):
        status = 404 if result is store.BookingRefusal.NOT_FOUND else 409
        return public_page(request, conn, htx, status, result.message, tour_id, form)
    return redirect(request, f"/public/{htx}/booking", code=result.code, booked=1)


@app.get("/public/{htx}/booking")
def public_booking(request: Request, htx: str = Depends(public_htx), conn=Depends(db), code: str = "",
                   phone: str = "", booked: str = ""):
    code = code.strip().upper()[:16]
    found = None
    if code and phone:
        normalized = store.normalize_phone(phone)
        found = normalized and store.lookup(conn, htx, code, normalized)
        if not found:
            return page(request, "booking.html", 404, htx=htx, code=code, error=NOT_FOUND_BOOKING)
    return page(request, "booking.html", htx=htx, code=code, booked=bool(booked and code and not phone),
                found=found)
