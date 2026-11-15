# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Back office sales desk: overview, bookings, payments, customers, reviews and inquiries, reports (spec 6).

Every booking change goes through store.core; this module parses the form, calls it and shows what it answered.
Writes are POST and answer 303; a bad form is 422 with the typed values, a refusal of the core is 409 (404 not found).
"""
import re
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Form, Request
from starlette.exceptions import HTTPException

from tea_tour import appkit
from tea_tour.claims import Claims
from tea_tour.domain.text import normalise_phone
from tea_tour.store import core, sales
from tea_tour.web import actor_of, href, open_db, page, redirect, role, theme_of

router = APIRouter()

DONE = {"confirm": "Đã xác nhận lượt đặt.", "payment": "Đã ghi khoản thu.", "refund": "Đã ghi khoản hoàn.",
        "cancel": "Đã huỷ lượt đặt.", "move": "Đã đổi chuyến.", "resize": "Đã sửa số người.", "note": "Đã lưu ghi chú.",
        "created": "Đã tạo lượt đặt."}
INVALID = {core.Refusal.INVALID_INPUT, core.Refusal.PARTY_SIZE, core.Refusal.REASON_REQUIRED}
EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
KEY_RE = re.compile(r"[A-Za-z0-9_-]{8,64}")


def parse_id(raw: str) -> UUID:
    try:
        return UUID(raw)
    except ValueError:
        raise HTTPException(404)


def refusal_status(refusal: core.Refusal) -> int:
    if refusal is core.Refusal.NOT_FOUND:
        return 404
    return 422 if refusal in INVALID else 409


def parse_filters(request: Request) -> sales.BookingFilters:
    query = request.query_params
    departure = query.get("departure", "")
    try:
        departure_id = UUID(departure) if departure else None
    except ValueError:
        departure_id = None
    return sales.BookingFilters(
        q=query.get("q", "").strip()[:100],
        status=query.get("status", "") if query.get("status", "") in sales.STATUSES else "",
        payment=query.get("payment", "") if query.get("payment", "") in sales.PAYMENT_STATES else "",
        departure=departure_id, date_from=appkit.parse_date(query.get("from")), date_to=appkit.parse_date(query.get("to")),
        reported=query.get("reported") == "1")


def pager(request: Request, path: str, params: dict, paging: appkit.Page, key: str = "page"):
    """(prev_href, next_href) of a list that keeps its filters."""
    theme = theme_of(request)
    return (href(path, theme, **params, **{key: paging.number - 1}) if paging.has_prev else None,
            href(path, theme, **params, **{key: paging.number + 1}) if paging.has_next else None)


# ---------- overview ----------

@router.get("/")
def overview(request: Request, claims: Claims = Depends(role("manager"))):
    with open_db() as conn:
        core.sweep(conn, claims.htx_code)  # opening the overview frees expired holds (spec 7.2)
        view = sales.overview(conn, claims.htx_code)
    return page(request, "admin/sales/overview.html", view=view, htx=claims.htx_code)


# ---------- bookings: list and CSV ----------

@router.get("/bookings")
def bookings(request: Request, claims: Claims = Depends(role("manager"))):
    filters = parse_filters(request)
    with open_db() as conn:
        rows, paging = sales.list_bookings(conn, claims.htx_code, filters, request.query_params.get("page"))
        choices = sales.filter_departures(conn, claims.htx_code)
    prev_href, next_href = pager(request, "/bookings", filters.params(), paging)
    return page(request, "admin/sales/bookings.html", rows=rows, paging=paging, filters=filters, departures=choices,
                prev_href=prev_href, next_href=next_href, htx=claims.htx_code, export_params=filters.params(),
                states=sales.PAYMENT_STATES)


@router.get("/bookings/export.csv")
def bookings_csv(request: Request, claims: Claims = Depends(role("manager"))):
    with open_db() as conn:
        rows = sales.export_bookings(conn, claims.htx_code, parse_filters(request))
    header = ["Mã đặt chỗ", "Trạng thái", "Thanh toán", "Khách", "Số điện thoại", "Email", "Tour", "Giờ khởi hành",
              "Người lớn", "Trẻ em", "Tổng tiền", "Tiền cọc", "Đã trả", "Nguồn", "Ghi chú của khách", "Ghi chú nội bộ",
              "Lý do huỷ", "Đặt lúc"]
    lines = [[r.code, r.status, r.payment_state, r.guest_name, r.phone, r.email, r.tour_title, appkit.vn_datetime(r.starts_at),
              r.adults, r.children, r.total_vnd, r.deposit_vnd, r.paid_vnd, r.source, r.note, r.internal_note,
              r.cancel_reason, appkit.vn_datetime(r.created_at)] for r in rows]
    return appkit.csv_response(appkit.csv_filename("tea-tour", claims.htx_code, "luot-dat", today_vn()), header, lines)


# ---------- bookings: on behalf of a caller ----------

def new_booking_page(request, conn, claims, values: dict, errors: dict, status: int = 200, error: str = ""):
    return page(request, "admin/sales/booking_new.html", status, htx=claims.htx_code, values=values, errors=errors,
                error=error, departures=sales.bookable_departures(conn, claims.htx_code))


@router.get("/bookings/new")
def booking_new(request: Request, claims: Claims = Depends(role("manager"))):
    values = {"departure": request.query_params.get("departure", ""), "adults": "1", "children": "0", "guest_name": "",
              "phone": "", "email": "", "note": "", "request_key": secrets.token_urlsafe(16)}
    with open_db() as conn:
        return new_booking_page(request, conn, claims, values, {})


@router.post("/bookings")
def booking_create(request: Request, claims: Claims = Depends(role("manager")), departure: str = Form(""),
                   adults: str = Form(""), children: str = Form(""), guest_name: str = Form(""), phone: str = Form(""),
                   email: str = Form(""), note: str = Form(""), request_key: str = Form("")):
    values = {"departure": departure.strip(), "adults": adults.strip(), "children": children.strip(),
              "guest_name": guest_name.strip(), "phone": phone.strip(), "email": email.strip(), "note": note.strip(),
              "request_key": request_key.strip()}
    errors: dict[str, str] = {}
    try:
        departure_id = UUID(values["departure"])
    except ValueError:
        departure_id = None
        errors["departure"] = "Chọn một chuyến."
    n_adults, n_children = appkit.parse_int(values["adults"], 0, 200), appkit.parse_int(values["children"], 0, 200)
    if n_adults is None:
        errors["adults"] = "Nhập số từ 0 đến 200."
    if n_children is None:
        errors["children"] = "Nhập số từ 0 đến 200."
    if not errors and n_adults + n_children < 1:
        errors["adults"] = "Cần ít nhất một khách."
    if not 1 <= len(values["guest_name"]) <= 80:
        errors["guest_name"] = "Nhập tên khách (tối đa 80 ký tự)."
    phone_clean = normalise_phone(values["phone"])
    if phone_clean is None:
        errors["phone"] = "Số điện thoại gồm 10 số, bắt đầu bằng 0."
    if values["email"] and (len(values["email"]) > 120 or not EMAIL_RE.fullmatch(values["email"])):
        errors["email"] = "Email không hợp lệ (tối đa 120 ký tự)."
    if len(values["note"]) > 500:
        errors["note"] = "Ghi chú tối đa 500 ký tự."
    if not KEY_RE.fullmatch(values["request_key"]):
        errors["request_key"] = "Biểu mẫu đã cũ. Vui lòng kiểm tra lại và gửi tiếp."
        values["request_key"] = secrets.token_urlsafe(16)
    with open_db() as conn:
        if errors:
            return new_booking_page(request, conn, claims, values, errors, 422)
        result = core.create_booking(conn, core.NewBooking(
            htx_code=claims.htx_code, departure_id=departure_id, adults=n_adults, children=n_children,
            guest_name=values["guest_name"], phone=phone_clean, email=values["email"] or None, note=values["note"] or None,
            request_key=values["request_key"], source="MANAGER"), actor_of(claims, "MANAGER"))
        if isinstance(result, core.Refusal):
            if result is core.Refusal.NOT_FOUND:
                raise HTTPException(404)
            return new_booking_page(request, conn, claims, values, {}, refusal_status(result), result.message)
    return redirect(request, f"/bookings/{result.id}", done="created")


# ---------- bookings: one booking and its actions ----------

def booking_page(request, conn, claims, booking_id: UUID, status: int = 200, form: str = "", errors=None, values=None,
                 error: str = ""):
    booking = core.get_booking(conn, claims.htx_code, booking_id)
    if booking is None:
        raise HTTPException(404)
    return page(request, "admin/sales/booking.html", status, htx=claims.htx_code, booking=booking,
                detail=sales.booking_detail(conn, claims.htx_code, booking), form=form, errors=errors or {},
                values=values or {}, error=error, notice=DONE.get(request.query_params.get("done", "")),
                methods=core.METHOD_LABELS, now=datetime.now(timezone.utc))


@router.get("/bookings/{booking_id}")
def booking_view(booking_id: str, request: Request, claims: Claims = Depends(role("manager"))):
    with open_db() as conn:
        return booking_page(request, conn, claims, parse_id(booking_id))


def run_action(request, claims, booking_id: str, form: str, done: str, call, values=None, errors=None):
    """Run one core call for a booking of this cooperative; show its refusal on the booking page, else 303."""
    booking_uuid = parse_id(booking_id)
    values = values or {}
    with open_db() as conn:
        if errors:
            return booking_page(request, conn, claims, booking_uuid, 422, form, errors, values)
        result = call(conn, booking_uuid)
        if isinstance(result, core.Refusal):
            if result is core.Refusal.NOT_FOUND:
                raise HTTPException(404)
            return booking_page(request, conn, claims, booking_uuid, refusal_status(result), form, {}, values, result.message)
    return redirect(request, f"/bookings/{booking_uuid}", done=done)


@router.post("/bookings/{booking_id}/confirm")
def booking_confirm(booking_id: str, request: Request, claims: Claims = Depends(role("manager"))):
    return run_action(request, claims, booking_id, "confirm", "confirm",
                      lambda conn, bid: core.confirm_booking(conn, claims.htx_code, bid, actor_of(claims, "MANAGER")))


@router.post("/bookings/{booking_id}/payments")
def booking_payment(booking_id: str, request: Request, claims: Claims = Depends(role("manager")), amount: str = Form(""),
                    kind: str = Form(""), method: str = Form(""), note: str = Form("")):
    values = {"amount": amount.strip(), "kind": kind, "method": method, "note": note.strip()}
    cleaned = re.sub(r"[ .,]", "", values["amount"])
    sum_vnd = appkit.parse_int(cleaned, 1, 10**10) if cleaned else None
    errors = {}
    if sum_vnd is None:
        errors["amount"] = "Nhập số tiền lớn hơn 0, ví dụ 250.000."
    if kind not in ("in", "out"):
        errors["kind"] = "Chọn thu hoặc hoàn."
    if method not in core.METHODS:
        errors["method"] = "Chọn chuyển khoản hoặc tiền mặt."
    if len(values["note"]) > 200:
        errors["note"] = "Ghi chú tối đa 200 ký tự."
    signed = (sum_vnd or 0) * (-1 if kind == "out" else 1)
    return run_action(request, claims, booking_id, "payments", "refund" if kind == "out" else "payment",
                      lambda conn, bid: core.record_payment(conn, claims.htx_code, bid, signed, method, values["note"] or None,
                                                            actor_of(claims, "MANAGER")), values, errors)


@router.post("/bookings/{booking_id}/cancel")
def booking_cancel(booking_id: str, request: Request, claims: Claims = Depends(role("manager")), reason: str = Form("")):
    values = {"reason": reason.strip()}
    errors = {} if values["reason"] else {"reason": core.Refusal.REASON_REQUIRED.message}
    if len(values["reason"]) > 200:
        errors["reason"] = "Lý do tối đa 200 ký tự."
    return run_action(request, claims, booking_id, "cancel", "cancel",
                      lambda conn, bid: core.cancel_booking(conn, claims.htx_code, bid, values["reason"], actor_of(claims, "MANAGER")),
                      values, errors)


@router.post("/bookings/{booking_id}/move")
def booking_move(booking_id: str, request: Request, claims: Claims = Depends(role("manager")), departure: str = Form("")):
    values = {"departure": departure.strip()}
    try:
        target = UUID(values["departure"])
        errors = {}
    except ValueError:
        target, errors = None, {"departure": "Chọn chuyến muốn đổi sang."}
    return run_action(request, claims, booking_id, "move", "move",
                      lambda conn, bid: core.move_booking(conn, claims.htx_code, bid, target, actor_of(claims, "MANAGER")),
                      values, errors)


@router.post("/bookings/{booking_id}/resize")
def booking_resize(booking_id: str, request: Request, claims: Claims = Depends(role("manager")), adults: str = Form(""),
                   children: str = Form("")):
    values = {"adults": adults.strip(), "children": children.strip()}
    n_adults, n_children = appkit.parse_int(values["adults"], 0, 200), appkit.parse_int(values["children"], 0, 200)
    errors = {}
    if n_adults is None:
        errors["adults"] = "Nhập số từ 0 đến 200."
    if n_children is None:
        errors["children"] = "Nhập số từ 0 đến 200."
    if not errors and n_adults + n_children < 1:
        errors["adults"] = core.Refusal.PARTY_SIZE.message
    return run_action(request, claims, booking_id, "resize", "resize",
                      lambda conn, bid: core.resize_booking(conn, claims.htx_code, bid, n_adults, n_children, actor_of(claims, "MANAGER")),
                      values, errors)


@router.post("/bookings/{booking_id}/note")
def booking_note(booking_id: str, request: Request, claims: Claims = Depends(role("manager")), note: str = Form("")):
    values = {"note": note.strip()}
    errors = {"note": "Ghi chú tối đa 500 ký tự."} if len(values["note"]) > 500 else {}

    def save(conn, bid):
        return None if sales.set_internal_note(conn, claims.htx_code, bid, values["note"] or None) else core.Refusal.NOT_FOUND

    return run_action(request, claims, booking_id, "note", "note", save, values, errors)


# ---------- payments ledger ----------

def parse_payment_filters(request: Request) -> sales.PaymentFilters:
    query = request.query_params
    return sales.PaymentFilters(method=query.get("method", "") if query.get("method", "") in sales.METHODS else "",
                                date_from=appkit.parse_date(query.get("from")), date_to=appkit.parse_date(query.get("to")),
                                q=query.get("q", "").strip()[:100])


def today_vn():
    return datetime.now(timezone.utc).astimezone(appkit.VN_TZ).date()


@router.get("/payments")
def payments(request: Request, claims: Claims = Depends(role("manager"))):
    filters = parse_payment_filters(request)
    with open_db() as conn:
        rows, paging, totals = sales.list_payments(conn, claims.htx_code, filters, request.query_params.get("page"))
    prev_href, next_href = pager(request, "/payments", filters.params(), paging)
    return page(request, "admin/sales/payments.html", rows=rows, paging=paging, totals=totals, filters=filters,
                prev_href=prev_href, next_href=next_href, htx=claims.htx_code, export_params=filters.params(),
                methods=core.METHOD_LABELS)


@router.get("/payments/export.csv")
def payments_csv(request: Request, claims: Claims = Depends(role("manager"))):
    with open_db() as conn:
        rows = sales.export_payments(conn, claims.htx_code, parse_payment_filters(request))
    header = ["Lúc", "Mã đặt chỗ", "Khách", "Số tiền", "Hình thức", "Người ghi", "Ghi chú"]
    lines = [[appkit.vn_datetime(r.recorded_at), r.code, r.guest_name, r.amount_vnd, core.METHOD_LABELS[r.method],
              r.recorded_by_name, r.note] for r in rows]
    return appkit.csv_response(appkit.csv_filename("tea-tour", claims.htx_code, "thu-tien", today_vn()), header, lines)


# ---------- customers ----------

@router.get("/customers")
def customers(request: Request, claims: Claims = Depends(role("manager"))):
    q = request.query_params.get("q", "").strip()[:100]
    with open_db() as conn:
        rows, paging = sales.list_customers(conn, claims.htx_code, q, request.query_params.get("page"))
    prev_href, next_href = pager(request, "/customers", {"q": q} if q else {}, paging)
    return page(request, "admin/sales/customers.html", rows=rows, paging=paging, q=q, prev_href=prev_href,
                next_href=next_href, htx=claims.htx_code)


@router.get("/customers/export.csv")
def customers_csv(request: Request, claims: Claims = Depends(role("manager"))):
    q = request.query_params.get("q", "").strip()[:100]
    with open_db() as conn:
        rows, _ = sales.list_customers(conn, claims.htx_code, q, None, everything=True)
    header = ["Số điện thoại", "Tên gần nhất", "Số lần đặt", "Số lần đã đi", "Tổng đã trả", "Lần đặt gần nhất"]
    lines = [[r.phone, r.guest_name, r.bookings, r.went, r.paid_vnd, appkit.vn_datetime(r.last_at)] for r in rows]
    return appkit.csv_response(appkit.csv_filename("tea-tour", claims.htx_code, "khach", today_vn()), header, lines)


# ---------- reviews and inquiries ----------

REVIEW_DONE = {"publish": "Đã đăng đánh giá lên trang khách.", "hide": "Đã ẩn đánh giá.", "reply": "Đã lưu câu trả lời.",
               "inquiry": "Đã cập nhật yêu cầu."}


def reviews_page(request, conn, claims, status: int = 200, error: str = "", target: str = "", values=None):
    query = request.query_params
    review_status = query.get("status", "") if query.get("status", "") in sales.REVIEW_STATUSES else ""
    inquiry_status = query.get("inq", "") if query.get("inq", "") in sales.INQUIRY_STATUSES else ""
    reviews_, review_paging, review_counts = sales.list_reviews(conn, claims.htx_code, review_status, query.get("page"))
    inquiries_, inquiry_paging, inquiry_counts = sales.list_inquiries(conn, claims.htx_code, inquiry_status, query.get("ipage"))
    ipage = {"ipage": inquiry_paging.number} if inquiry_paging.number > 1 else {}
    rpage = {"page": review_paging.number} if review_paging.number > 1 else {}
    keep = {"status": review_status, "inq": inquiry_status}
    keep = {key: value for key, value in keep.items() if value}
    review_prev, review_next = pager(request, "/reviews", {**keep, **ipage}, review_paging)
    inquiry_prev, inquiry_next = pager(request, "/reviews", {**keep, **rpage}, inquiry_paging, "ipage")
    return page(request, "admin/sales/reviews.html", status, htx=claims.htx_code, reviews=reviews_, review_paging=review_paging,
                review_counts=review_counts, review_status=review_status, review_prev=review_prev, review_next=review_next,
                inquiries=inquiries_, inquiry_paging=inquiry_paging, inquiry_counts=inquiry_counts,
                inquiry_status=inquiry_status, inquiry_prev=inquiry_prev, inquiry_next=inquiry_next, error=error,
                target=target, values=values or {}, notice=REVIEW_DONE.get(query.get("done", "")))


@router.get("/reviews")
def reviews(request: Request, claims: Claims = Depends(role("manager"))):
    with open_db() as conn:
        return reviews_page(request, conn, claims)


def moderate(request, claims, review_id: str, done: str, save, target_values=None, error: str = ""):
    rid = parse_id(review_id)
    with open_db() as conn:
        if error:
            return reviews_page(request, conn, claims, 422, error, str(rid), target_values)
        if not save(conn, rid):
            raise HTTPException(404)
    return redirect(request, "/reviews", done=done)


@router.post("/reviews/{review_id}/publish")
def review_publish(review_id: str, request: Request, claims: Claims = Depends(role("manager"))):
    return moderate(request, claims, review_id, "publish", lambda conn, rid: sales.set_review_status(conn, claims.htx_code, rid, "PUBLISHED"))


@router.post("/reviews/{review_id}/hide")
def review_hide(review_id: str, request: Request, claims: Claims = Depends(role("manager"))):
    return moderate(request, claims, review_id, "hide", lambda conn, rid: sales.set_review_status(conn, claims.htx_code, rid, "HIDDEN"))


@router.post("/reviews/{review_id}/reply")
def review_reply(review_id: str, request: Request, claims: Claims = Depends(role("manager")), reply: str = Form("")):
    text = reply.strip()
    error = "Câu trả lời tối đa 1000 ký tự." if len(text) > 1000 else ""
    return moderate(request, claims, review_id, "reply",
                    lambda conn, rid: sales.set_review_reply(conn, claims.htx_code, rid, text or None), {"reply": reply}, error)


@router.post("/inquiries/{inquiry_id}")
def inquiry_update(inquiry_id: str, request: Request, claims: Claims = Depends(role("manager")), status: str = Form(""),
                   note: str = Form("")):
    iid = parse_id(inquiry_id)
    text = note.strip()
    error = ("Chọn trạng thái của yêu cầu." if status not in sales.INQUIRY_STATUSES
             else "Ghi chú tối đa 500 ký tự." if len(text) > 500 else "")
    with open_db() as conn:
        if error:
            return reviews_page(request, conn, claims, 422, error, str(iid), {"status": status, "note": note})
        if not sales.update_inquiry(conn, claims.htx_code, iid, status, text or None):
            raise HTTPException(404)
    return redirect(request, "/reviews", done="inquiry")


# ---------- reports ----------

@router.get("/reports")
def reports(request: Request, claims: Claims = Depends(role("manager"))):
    with open_db() as conn:
        report = sales.reports(conn, claims.htx_code)
    months = report.months
    charts = {"guests": appkit.chart_rows([(m.label, m.guests) for m in months]),
              "bookings": appkit.chart_rows([(m.label, m.bookings) for m in months]),
              "money": appkit.chart_rows([(m.label, m.collected) for m in months], appkit.money)}
    return page(request, "admin/sales/reports.html", report=report, charts=charts, htx=claims.htx_code, number=appkit.number,
                total_guests=sum(m.guests for m in months), total_bookings=sum(m.bookings for m in months),
                total_money=sum(m.collected for m in months))
