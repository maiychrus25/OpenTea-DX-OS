# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Customer site under /public/<htx> (spec 5): catalogue, booking in three steps, my booking, ticket, reviews, inquiry.

No cookies and no script: a guest's own pages are addressed by booking code + access key, and every form posts both.
A POST that works answers 303; bad input re-renders the form with status 422 and what was typed.
"""
import re
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Form, Request
from starlette.exceptions import HTTPException

from tea_tour import appkit, qr
from tea_tour.domain import money, policy, vietqr
from tea_tour.domain.text import normalise_phone
from tea_tour.store import core, guest
from tea_tour.store import media as media_store
from tea_tour.store import settings as settings_store
from tea_tour.store import site
from tea_tour.web import PREFIX, VN_TZ, db, page, public_htx, redirect, templates

router = APIRouter()

WEEKDAYS = ("Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật")
EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
KEY_RE = re.compile(r"[A-Za-z0-9_-]{8,64}")
PARTY_MAX = core.GUEST_PARTY_MAX
NOT_FOUND_BOOKING = "Không tìm thấy lượt đặt. Hãy kiểm tra lại đường dẫn, hoặc tra cứu bằng mã đặt chỗ và số điện thoại."
LOOKUP_FAILED = "Không tìm thấy lượt đặt nào khớp mã và số điện thoại này."
PAYMENT_LABELS = {"UNPAID": "Chưa thanh toán", "DEPOSITED": "Đã trả một phần", "PAID": "Đã thanh toán đủ",
                  "REFUND_DUE": "Chờ hoàn tiền"}


# ---------- template helpers ----------

def _local(value: datetime) -> datetime:
    return value.astimezone(VN_TZ)


def day_label(value: datetime) -> str:
    local = _local(value)
    return f"{WEEKDAYS[local.weekday()]}, {local:%d/%m/%Y}"


def short_day(value: datetime) -> str:
    local = _local(value)
    return f"{('T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN')[local.weekday()]} {local:%d/%m}"


def time_label(value: datetime) -> str:
    return f"{_local(value):%H:%M}"


def month_label(value: datetime | str) -> str:
    if isinstance(value, str):
        return f"Tháng {int(value[5:7])}/{value[:4]}"
    local = _local(value)
    return f"Tháng {local.month}/{local.year}"


def duration_label(minutes: int) -> str:
    if minutes >= 24 * 60:
        days = -(-minutes // (24 * 60))
        return f"{days} ngày"
    hours, rest = divmod(minutes, 60)
    return f"{hours} giờ" + (f" {rest} phút" if rest else "") if hours else f"{rest} phút"


def tel_href(number: str) -> str:
    return "tel:" + re.sub(r"[^0-9+]", "", number)


def rating_text(average: float) -> str:
    return f"{average:.1f}".replace(".", ",")


def photo_url(htx: str, media_id, variant: str = "large") -> str:
    return f"{PREFIX}/public/{htx}/media/{media_id}-{variant}.jpg"


templates.env.globals.update(photo_url=photo_url, categories=site.CATEGORIES, day_label=day_label, short_day=short_day,
                             time_label=time_label, month_label=month_label, duration_label=duration_label,
                             tel_href=tel_href, payment_labels=PAYMENT_LABELS, rating_text=rating_text)


def render(request: Request, conn, htx: str, name: str, status: int = 200, **context):
    """Every public page carries the cooperative's settings for the header and footer."""
    return page(request, name, status, site=settings_store.get(conn, htx), **context)


def refusal_page(request: Request, conn, htx: str, refusal: core.Refusal, back_href: str = "", back_label: str = "Quay lại"):
    status = {core.Refusal.NOT_FOUND: 404, core.Refusal.INVALID_INPUT: 422, core.Refusal.PARTY_SIZE: 422}.get(refusal, 409)
    if status == 404:
        raise HTTPException(404)
    return render(request, conn, htx, "site/refusal.html", status, message=refusal.message, back_href=back_href,
                  back_label=back_label)


# ---------- home, catalogue, tour ----------

@router.get("/public/{htx}")
@router.get("/public/{htx}/")
def home(request: Request, htx: str = Depends(public_htx), conn=Depends(db)):
    return render(request, conn, htx, "site/home.html", cards=site.featured(conn, htx),
                  reviews=site.reviews(conn, htx, limit=3))


@router.get("/public/{htx}/tours")
def tours(request: Request, category: str = "", month: str = "", sort: str = "soon",
          htx: str = Depends(public_htx), conn=Depends(db)):
    params = request.query_params
    category = category if category in site.CATEGORIES else ""
    month = month if site.MONTH_RE.fullmatch(month) else ""
    sort = sort if sort in site.SORTS else "soon"
    cards = site.tour_cards(conn, htx, category or None, month or None, sort)
    paging = appkit.page_of(params.get("page"), len(cards), site.PAGE_SIZE)
    return render(request, conn, htx, "site/tours.html", cards=cards[paging.offset:paging.offset + site.PAGE_SIZE], paging=paging,
                  total=len(cards), category=category, month=month, sort=sort, months=site.months_open(conn, htx),
                  filtered=bool(category or month))


def published_tour(conn, htx: str, slug: str) -> site.Tour:
    tour = site.tour_by_slug(conn, htx, slug)
    if tour is None:
        raise HTTPException(404)
    return tour


@router.get("/public/{htx}/tours/{slug}")
def tour_page(request: Request, slug: str, htx: str = Depends(public_htx), conn=Depends(db)):
    tour = published_tour(conn, htx, slug)
    departures = site.upcoming_departures(conn, htx, tour.id)
    open_prices = [d.price_adult_vnd for d in departures if d.bookable]
    average, count = site.rating_of(conn, htx, tour.id)
    return render(request, conn, htx, "site/tour.html", tour=tour, departures=departures,
                  photos=media_store.list_tour_media(conn, htx, tour.id), reviews=site.reviews(conn, htx, tour.id, 6),
                  average=average, review_count=count, price_from=min(open_prices) if open_prices else tour.price_adult_vnd,
                  next_open=next((d for d in departures if d.bookable), None))


# ---------- booking: step 1 and 2 ----------

def parse_party(form: dict, errors: dict) -> tuple[int, int]:
    adults = appkit.parse_int(form["adults"], 0, PARTY_MAX)
    children = appkit.parse_int(form["children"], 0, PARTY_MAX)
    if adults is None:
        errors["adults"] = "Số người lớn không hợp lệ (từ 0 đến 20)."
    if children is None:
        errors["children"] = "Số trẻ em không hợp lệ (từ 0 đến 20)."
    if adults is not None and children is not None:
        if adults < 1:
            errors["adults"] = "Cần ít nhất một người lớn đi cùng."
        elif adults + children > PARTY_MAX:
            errors["adults"] = f"Mỗi lượt đặt tối đa {PARTY_MAX} người, kể cả trẻ em."
    return adults or 0, children or 0


def check_form(form: dict, departures: list[site.DepartureRow] | None) -> tuple[dict, dict, dict]:
    """(clean values, {field: error}, parsed numbers). departures None skips the choice of departure (the core decides)."""
    errors: dict[str, str] = {}
    adults, children = parse_party(form, errors)
    name = form["guest_name"].strip()
    if not name:
        errors["guest_name"] = "Vui lòng nhập họ tên."
    elif len(name) > 80:
        errors["guest_name"] = "Họ tên tối đa 80 ký tự."
    phone = normalise_phone(form["phone"])
    if phone is None:
        errors["phone"] = "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0."
    email = form["email"].strip()
    if email and not (len(email) <= 120 and EMAIL_RE.fullmatch(email)):
        errors["email"] = "Email không hợp lệ."
    note = form["note"].strip()
    if len(note) > 500:
        errors["note"] = "Ghi chú tối đa 500 ký tự."
    departure = None
    try:
        departure = UUID(form["departure"])
    except ValueError:
        errors["departure"] = "Vui lòng chọn một chuyến."
    if departure and departures is not None:
        chosen = next((d for d in departures if d.id == departure), None)
        party = adults + children
        if chosen is None:
            errors["departure"] = "Vui lòng chọn một chuyến."
        elif chosen.status != "OPEN":
            errors["departure"] = core.Refusal.NOT_BOOKABLE.message
        elif chosen.seats_left == 0:
            errors["departure"] = core.Refusal.FULL.message
        elif "adults" not in errors and "children" not in errors and party > chosen.seats_left:
            errors["departure"] = f"Chuyến này chỉ còn {chosen.seats_left} chỗ."
    values = {"departure": form["departure"], "adults": form["adults"], "children": form["children"], "guest_name": name,
              "phone": phone or form["phone"].strip(), "email": email, "note": note}
    return values, errors, {"adults": adults, "children": children, "phone": phone, "departure": departure}


STEP_FIELDS = ("departure", "adults", "children", "guest_name", "phone", "email", "note")


def step_one(request: Request, conn, htx: str, tour: site.Tour, values: dict, errors: dict, status: int = 200, notice: str = ""):
    departures = site.upcoming_departures(conn, htx, tour.id)
    return render(request, conn, htx, "site/book.html", status, tour=tour, departures=departures, values=values, errors=errors,
                  notice=notice)


def step_two(request: Request, conn, htx: str, tour: site.Tour, values: dict, parsed: dict, departure: site.DepartureRow,
             status: int = 200, notice: str = "", errors: dict | None = None, request_key: str = ""):
    rules = settings_store.get(conn, htx)
    total = money.total_vnd(parsed["adults"], parsed["children"], departure.price_adult_vnd, departure.price_child_vnd)
    deposit = money.deposit_vnd(total, rules.deposit_percent)
    hold = policy.hold_until(datetime.now(timezone.utc), departure.starts_at, rules.hold_hours, deposit)
    return render(request, conn, htx, "site/book_review.html", status, tour=tour, departure=departure, values=values,
                  total=total, deposit=deposit, hold=hold, notice=notice, errors=errors or {},
                  request_key=request_key or secrets.token_urlsafe(16), adults=parsed["adults"], children=parsed["children"],
                  price_adult=departure.price_adult_vnd, price_child=departure.price_child_vnd)


@router.get("/public/{htx}/tours/{slug}/book")
def book_form(request: Request, slug: str, departure: str = "", htx: str = Depends(public_htx), conn=Depends(db)):
    tour = published_tour(conn, htx, slug)
    return step_one(request, conn, htx, tour, {"departure": departure, "adults": "2", "children": "0", "guest_name": "",
                                               "phone": "", "email": "", "note": ""}, {})


@router.post("/public/{htx}/tours/{slug}/book")
def book_check(request: Request, slug: str, departure: str = Form(""), adults: str = Form(""), children: str = Form(""),
               guest_name: str = Form(""), phone: str = Form(""), email: str = Form(""), note: str = Form(""),
               back: str = Form(""), htx: str = Depends(public_htx), conn=Depends(db)):
    tour = published_tour(conn, htx, slug)
    form = {"departure": departure.strip(), "adults": adults.strip(), "children": children.strip(), "guest_name": guest_name,
            "phone": phone, "email": email, "note": note}
    departures = site.upcoming_departures(conn, htx, tour.id)
    values, errors, parsed = check_form(form, departures)
    if errors or back:
        return step_one(request, conn, htx, tour, values, errors, 422 if errors else 200)
    chosen = next(d for d in departures if d.id == parsed["departure"])
    return step_two(request, conn, htx, tour, values, parsed, chosen)


@router.post("/public/{htx}/bookings")
def book_confirm(request: Request, departure: str = Form(""), adults: str = Form(""), children: str = Form(""),
                 guest_name: str = Form(""), phone: str = Form(""), email: str = Form(""), note: str = Form(""),
                 request_key: str = Form(""), expected_total: str = Form(""), agree: str = Form(""),
                 htx: str = Depends(public_htx), conn=Depends(db)):
    try:
        departure_id = UUID(departure.strip())
    except ValueError:
        raise HTTPException(404)
    tour = site.tour_of_departure(conn, htx, departure_id)
    if tour is None:
        raise HTTPException(404)
    form = {"departure": departure.strip(), "adults": adults.strip(), "children": children.strip(), "guest_name": guest_name,
            "phone": phone, "email": email, "note": note}
    values, errors, parsed = check_form(form, None)
    if errors:
        return step_one(request, conn, htx, tour, values, errors, 422)
    shown = appkit.parse_int(expected_total.strip(), 0, 10**10)
    current = site.departure_by_id(conn, htx, departure_id)
    if not KEY_RE.fullmatch(request_key.strip()) or shown is None:
        errors["agree"] = "Phiên đặt chỗ không hợp lệ. Vui lòng quay lại bước 1 và thử lại."
        return step_two(request, conn, htx, tour, values, parsed, current, 422, errors=errors)
    if not agree:
        errors["agree"] = "Vui lòng đồng ý với chính sách đặt cọc và huỷ chỗ để tiếp tục."
        return step_two(request, conn, htx, tour, values, parsed, current, 422, errors=errors, request_key=request_key.strip())
    new = core.NewBooking(htx, departure_id, parsed["adults"], parsed["children"], values["guest_name"], parsed["phone"],
                          values["email"] or None, values["note"] or None, request_key.strip(), "WEB", shown)
    result = core.create_booking(conn, new, core.Actor("GUEST", values["guest_name"]))
    if isinstance(result, core.Booking):
        return redirect(request, f"/public/{htx}/booking", code=result.code, key=result.access_key, booked=1)
    back = f"{PREFIX}/public/{htx}/tours/{tour.slug}"
    if result is core.Refusal.PRICE_CHANGED:
        return step_two(request, conn, htx, tour, values, parsed, current, 200, notice=result.message,
                        request_key=request_key.strip())
    if result in (core.Refusal.INVALID_INPUT, core.Refusal.PARTY_SIZE):
        return step_one(request, conn, htx, tour, values, {"adults": result.message}, 422)
    return refusal_page(request, conn, htx, result, back, "Chọn chuyến khác")


# ---------- my booking ----------

def owned(conn, htx: str, code: str, key: str) -> core.Booking | None:
    found = core.find_booking(conn, htx, code, key)
    if found and found.status == "PENDING":  # an expired hold is cancelled when the guest looks, not at some later sweep
        if core.sweep(conn, htx, found.departure_id):
            found = core.find_booking(conn, htx, code, key)
    return found


def timeline_of(booking: core.Booking) -> list[dict]:
    """Four steps; the first one not done is the current one."""
    paid_enough = booking.deposit_vnd == 0 or booking.paid_vnd >= booking.deposit_vnd
    states = [True, paid_enough, booking.status == "CONFIRMED", bool(booking.checked_in_count)]
    labels = ["Đã đặt chỗ", "Đã đặt cọc" if booking.deposit_vnd else "Thanh toán", "HTX xác nhận", "Tham gia tour"]
    first_open = next((i for i, done in enumerate(states) if not done), len(states))
    return [{"label": label, "state": "done" if done else "current" if i == first_open else "todo"}
            for i, (label, done) in enumerate(zip(labels, states))]


def status_label(booking: core.Booking) -> tuple[str, str]:
    """(text, tone) of the status pill; the tone is a CSS modifier."""
    if booking.status == "CANCELLED":
        return "Đã huỷ", "danger"
    if booking.status == "CONFIRMED":
        return "Đã xác nhận", "success"
    if booking.guest_paid_reported_at:
        return "Chờ HTX kiểm tra thanh toán", "warning"
    if booking.paid_vnd < booking.deposit_vnd:
        return "Chờ đặt cọc", "warning"
    return "Chờ HTX xác nhận", "warning"


def payment_block(booking: core.Booking, rules: settings_store.Settings) -> dict:
    """What the payment card shows: a VietQR while money is due and the bank is set, otherwise the hotline."""
    due = booking.amount_due_now
    block = {"due": due, "qr": None, "content": f"TOUR {booking.code}", "bank": rules.bank_name, "account": rules.bank_account,
             "holder": rules.bank_holder}
    if due > 0 and rules.bank_ready:
        try:
            block["qr"] = qr.qr_data_uri(vietqr.payload(rules.bank_bin, rules.bank_account, due, block["content"]))
        except ValueError:
            block["qr"] = None  # a bank detail the standard refuses: show the hotline rather than a wrong code
    return block


def booking_page(request: Request, conn, htx: str, booking: core.Booking, status: int = 200, **extra):
    rules = settings_store.get(conn, htx)
    now = datetime.now(timezone.utc)
    review = guest.review_of(conn, htx, booking.id)
    label, tone = status_label(booking)
    can_review = booking.status == "CONFIRMED" and bool(booking.checked_in_count) and booking.starts_at <= now and review is None
    context = dict(booking=booking, trip=guest.trip_of(conn, htx, booking.departure_id), review=review, status_label=label,
                   status_tone=tone, timeline=timeline_of(booking), pay=payment_block(booking, rules),
                   can_cancel=policy.guest_can_cancel(booking.status, booking.starts_at, rules.cancel_free_hours, now),
                   can_review=can_review, rules=rules, errors={}, values={}, booked=False, reviewed=False,
                   show_payment=booking.status != "CANCELLED" and booking.amount_due_now > 0)
    return render(request, conn, htx, "site/booking.html", status, **{**context, **extra})


def lookup_page(request: Request, conn, htx: str, status: int = 200, message: str = "", code: str = ""):
    return render(request, conn, htx, "site/lookup.html", status, message=message, code=code)


@router.get("/public/{htx}/booking")
def my_booking(request: Request, code: str = "", key: str = "", booked: str = "", reviewed: str = "", htx: str = Depends(public_htx),
               conn=Depends(db)):
    if not code and not key:
        return lookup_page(request, conn, htx)
    found = owned(conn, htx, code, key)
    if found is None:
        return lookup_page(request, conn, htx, 404, NOT_FOUND_BOOKING)
    return booking_page(request, conn, htx, found, booked=booked == "1", reviewed=reviewed == "1")


@router.post("/public/{htx}/booking/lookup")
def lookup(request: Request, code: str = Form(""), phone: str = Form(""), htx: str = Depends(public_htx), conn=Depends(db)):
    found = core.lookup_booking(conn, htx, code, phone) if code.strip() else None
    if found is None:
        return lookup_page(request, conn, htx, 404, LOOKUP_FAILED, code.strip().upper()[:12])
    return redirect(request, f"/public/{htx}/booking", code=found.code, key=found.access_key)


def own_or_404(conn, htx: str, code: str, key: str) -> core.Booking:
    found = owned(conn, htx, code.strip(), key.strip())
    if found is None:
        raise HTTPException(404)
    return found


def back_to(request: Request, htx: str, booking: core.Booking, **params):
    return redirect(request, f"/public/{htx}/booking", code=booking.code, key=booking.access_key, **params)


def booking_href(htx: str, booking: core.Booking) -> str:
    return f"{PREFIX}/public/{htx}/booking?code={booking.code}&key={booking.access_key}"


@router.post("/public/{htx}/booking/paid")
def report_paid(request: Request, code: str = Form(""), key: str = Form(""), htx: str = Depends(public_htx), conn=Depends(db)):
    booking = own_or_404(conn, htx, code, key)
    result = core.report_paid(conn, htx, booking.id)
    if isinstance(result, core.Refusal):
        return refusal_page(request, conn, htx, result, booking_href(htx, booking), "Về lượt đặt của tôi")
    return back_to(request, htx, booking)


@router.post("/public/{htx}/booking/cancel")
def cancel(request: Request, code: str = Form(""), key: str = Form(""), reason: str = Form(""), htx: str = Depends(public_htx),
           conn=Depends(db)):
    booking = own_or_404(conn, htx, code, key)
    result = core.cancel_booking(conn, htx, booking.id, reason.strip()[:200], core.Actor("GUEST", booking.guest_name))
    if isinstance(result, core.Refusal):
        return refusal_page(request, conn, htx, result, booking_href(htx, booking), "Về lượt đặt của tôi")
    return back_to(request, htx, booking)


@router.post("/public/{htx}/booking/review")
def review(request: Request, code: str = Form(""), key: str = Form(""), rating: str = Form(""), comment: str = Form(""),
           display_name: str = Form(""), htx: str = Depends(public_htx), conn=Depends(db)):
    booking = own_or_404(conn, htx, code, key)
    stars = appkit.parse_int(rating.strip(), 1, 5)
    comment, display_name = comment.strip(), display_name.strip()
    errors = {}
    if stars is None:
        errors["rating"] = "Vui lòng chọn từ 1 đến 5 sao."
    if len(comment) > 1000:
        errors["comment"] = "Nhận xét tối đa 1000 ký tự."
    if len(display_name) > 40:
        errors["display_name"] = "Tên hiển thị tối đa 40 ký tự."
    if errors:
        return booking_page(request, conn, htx, booking, 422, errors=errors,
                            values={"rating": rating.strip(), "comment": comment, "display_name": display_name})
    result = core.add_review(conn, htx, booking.id, stars, comment, display_name)
    if isinstance(result, core.Refusal):
        return refusal_page(request, conn, htx, result, booking_href(htx, booking), "Về lượt đặt của tôi")
    return back_to(request, htx, booking, reviewed=1)


@router.get("/public/{htx}/ticket")
def ticket(request: Request, code: str = "", key: str = "", htx: str = Depends(public_htx), conn=Depends(db)):
    booking = owned(conn, htx, code, key)
    if booking is None or booking.status != "CONFIRMED":
        raise HTTPException(404)
    return render(request, conn, htx, "site/ticket.html", booking=booking, trip=guest.trip_of(conn, htx, booking.departure_id),
                  qr=qr.qr_data_uri(qr.ticket_text(htx, booking.code)), pay_state=PAYMENT_LABELS[booking.payment_state])


# ---------- inquiry and policy ----------

INQUIRY_FIELDS = ("name", "phone", "group_size", "desired_date", "message")


@router.get("/public/{htx}/inquiry")
def inquiry_form(request: Request, sent: str = "", htx: str = Depends(public_htx), conn=Depends(db)):
    return render(request, conn, htx, "site/inquiry.html", sent=sent == "1", values={}, errors={})


@router.post("/public/{htx}/inquiry")
def inquiry_send(request: Request, name: str = Form(""), phone: str = Form(""), group_size: str = Form(""),
                 desired_date: str = Form(""), message: str = Form(""), htx: str = Depends(public_htx), conn=Depends(db)):
    values = {"name": name.strip(), "phone": phone.strip(), "group_size": group_size.strip(),
              "desired_date": desired_date.strip(), "message": message.strip()}
    errors = {}
    if not values["name"]:
        errors["name"] = "Vui lòng nhập họ tên."
    elif len(values["name"]) > 80:
        errors["name"] = "Họ tên tối đa 80 ký tự."
    normalised = normalise_phone(values["phone"])
    if normalised is None:
        errors["phone"] = "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0."
    size = appkit.parse_int(values["group_size"], 1, 500)
    if size is None:
        errors["group_size"] = "Số người từ 1 đến 500."
    wanted = None
    if values["desired_date"]:
        wanted = appkit.parse_date(values["desired_date"])
        if wanted is None:
            errors["desired_date"] = "Ngày mong muốn không hợp lệ (năm-tháng-ngày)."
    if len(values["message"]) > 1000:
        errors["message"] = "Lời nhắn tối đa 1000 ký tự."
    if errors:
        return render(request, conn, htx, "site/inquiry.html", 422, sent=False, values=values, errors=errors)
    guest.add_inquiry(conn, htx, values["name"], normalised, size, wanted, values["message"])
    return redirect(request, f"/public/{htx}/inquiry", sent=1)


@router.get("/public/{htx}/policy")
def policy_page(request: Request, htx: str = Depends(public_htx), conn=Depends(db)):
    return render(request, conn, htx, "site/policy.html")
