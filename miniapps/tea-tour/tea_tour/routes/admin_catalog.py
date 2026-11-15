# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Back office: tours, photos, departures, settings (spec 6, 7.7, 7.9). Writes are POST + 303; a bad form is shown again
with 422 and what was typed. Booking changes go through store.core."""
import logging
from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from starlette.datastructures import FormData
from starlette.exceptions import HTTPException

from tea_tour import appkit, core_client, media, qr
from tea_tour.claims import Claims
from tea_tour.domain import tour_templates, vietqr
from tea_tour.domain.policy import checkin_window
from tea_tour.store import catalog, core, settings
from tea_tour.store import media as media_store
from tea_tour.web import VN_TZ, actor_of, db, href, open_db, page, redirect, role, theme_of

log = logging.getLogger("tea_tour.admin_catalog")
router = APIRouter()
manager = Depends(role("manager"))
SPARE_ROWS = 3  # empty rows shown under the stored ones; a form without script cannot add rows


async def form_of(request: Request):
    form = await request.form()
    try:
        yield form
    finally:
        await form.close()  # releases the temporary files of an upload


def paging_links(request: Request, page_info: appkit.Page, path: str, **params) -> tuple[str | None, str | None]:
    theme = theme_of(request)
    return (href(path, theme, **params, page=page_info.number - 1) if page_info.has_prev else None,
            href(path, theme, **params, page=page_info.number + 1) if page_info.has_next else None)


def padded(items: list, blank, limit: int) -> list:
    """The stored rows plus spare empty ones (never more than the limit)."""
    return list(items) + [blank() for _ in range(max(0, min(SPARE_ROWS, limit - len(items))))]


def tour_or_404(conn, claims: Claims, tour_id: UUID) -> catalog.Tour:
    tour = catalog.get_tour(conn, claims.htx_code, tour_id)
    if tour is None:
        raise HTTPException(404)
    return tour


# ---------- tours ----------

@router.get("/tours")
def tours(request: Request, claims: Claims = manager, conn=Depends(db)):
    status = request.query_params.get("status", "")
    status = status if status in catalog.TOUR_STATUS_LABELS else None
    counts = catalog.status_counts(conn, claims.htx_code)
    page_info = appkit.page_of(request.query_params.get("page"), catalog.count_tours(conn, claims.htx_code, status))
    theme = theme_of(request)
    filters = [("", "Tất cả", sum(counts.values()), href("/tours", theme))] + [
        (key, label, counts.get(key, 0), href("/tours", theme, status=key)) for key, label in catalog.TOUR_STATUSES]
    return page(request, "admin/catalog/tours.html", active_tab="tours", htx=claims.htx_code, current=status or "",
                filters=filters, page_info=page_info, templates=tour_templates.TEMPLATES.values(),
                tours=catalog.list_tours(conn, claims.htx_code, status, page_info.size, page_info.offset),
                links=paging_links(request, page_info, "/tours", status=status))


def form_from_template(template: tour_templates.TourTemplate | None) -> dict:
    if template is None:
        return {"category": "PICKING", "duration_minutes": "180", "price_adult_vnd": "", "price_child_vnd": "",
                "default_seats": "10", "itinerary": [], "includes": [], "excludes": [], "bring": [], "faq": []}
    return {"title": template.title, "summary": template.summary, "description": template.description,
            "category": template.category, "duration_minutes": str(template.duration_minutes),
            "price_adult_vnd": str(template.price_adult_vnd), "price_child_vnd": str(template.price_child_vnd),
            "default_seats": str(template.default_seats), "itinerary": [dict(i) for i in template.itinerary],
            "includes": list(template.includes), "excludes": list(template.excludes), "bring": list(template.bring),
            "faq": [dict(i) for i in template.faq]}


def form_from_tour(tour: catalog.Tour) -> dict:
    return {"title": tour.title, "summary": tour.summary, "description": tour.description, "category": tour.category,
            "duration_minutes": str(tour.duration_minutes), "meeting_point": tour.meeting_point, "map_url": tour.map_url,
            "price_adult_vnd": str(tour.price_adult_vnd), "price_child_vnd": str(tour.price_child_vnd),
            "default_seats": str(tour.default_seats), "itinerary": tour.itinerary, "includes": tour.includes,
            "excludes": tour.excludes, "bring": tour.bring, "faq": tour.faq}


def tour_form_page(request: Request, claims: Claims, shown: dict, errors: dict, status: int = 200,
                   tour: catalog.Tour | None = None, template_key: str = ""):
    rows = {"itinerary": padded(shown.get("itinerary", []), lambda: {"time": "", "title": "", "detail": ""}, 12),
            "faq": padded(shown.get("faq", []), lambda: {"q": "", "a": ""}, 8),
            **{name: padded(shown.get(name, []), lambda: "", 10) for name in ("includes", "excludes", "bring")}}
    return page(request, "admin/catalog/tour_form.html", status, active_tab="tours", htx=claims.htx_code, tour=tour,
                shown=shown, errors=errors, rows=rows, categories=catalog.CATEGORIES, template_key=template_key,
                templates=tour_templates.TEMPLATES.values())


@router.get("/tours/new")
def tour_new(request: Request, claims: Claims = manager):
    key = request.query_params.get("template", "")
    return tour_form_page(request, claims, form_from_template(tour_templates.TEMPLATES.get(key)), {},
                          template_key=key if key in tour_templates.TEMPLATES else "")


@router.post("/tours")
def tour_create(request: Request, claims: Claims = manager, conn=Depends(db), form: FormData = Depends(form_of)):
    values, errors, shown = catalog.read_tour_form(form)
    if errors:
        return tour_form_page(request, claims, shown, errors, 422)
    return redirect(request, f"/tours/{catalog.create_tour(conn, claims.htx_code, values)}")


@router.get("/tours/{tour_id}")
def tour_detail(request: Request, tour_id: UUID, claims: Claims = manager, conn=Depends(db)):
    return tour_page(request, conn, claims, tour_or_404(conn, claims, tour_id))


def tour_page(request: Request, conn, claims: Claims, tour: catalog.Tour, status: int = 200, photo_error: str = ""):
    gallery = media_store.list_tour_media(conn, claims.htx_code, tour.id)
    return page(request, "admin/catalog/tour.html", status, active_tab="tours", htx=claims.htx_code, tour=tour,
                gallery=gallery, photo_error=photo_error, photo_limit=media_store.TOUR_LIMIT,
                departures=catalog.tour_departures(conn, claims.htx_code, tour.id),
                category=catalog.CATEGORY_LABELS.get(tour.category, tour.category), image_limits=media.ImageRefusal.TOO_MANY_PIXELS.message)


@router.get("/tours/{tour_id}/edit")
def tour_edit(request: Request, tour_id: UUID, claims: Claims = manager, conn=Depends(db)):
    tour = tour_or_404(conn, claims, tour_id)
    return tour_form_page(request, claims, form_from_tour(tour), {}, tour=tour)


@router.post("/tours/{tour_id}")
def tour_update(request: Request, tour_id: UUID, claims: Claims = manager, conn=Depends(db), form: FormData = Depends(form_of)):
    tour = tour_or_404(conn, claims, tour_id)
    values, errors, shown = catalog.read_tour_form(form)
    if errors:
        return tour_form_page(request, claims, shown, errors, 422, tour=tour)
    catalog.update_tour(conn, claims.htx_code, tour_id, values)
    return redirect(request, f"/tours/{tour_id}")


@router.post("/tours/{tour_id}/status")
def tour_status(request: Request, tour_id: UUID, claims: Claims = manager, conn=Depends(db), form: FormData = Depends(form_of)):
    tour = tour_or_404(conn, claims, tour_id)
    target = str(form.get("status", ""))
    if target not in catalog.TOUR_STATUS_LABELS:
        return page(request, "message.html", 422, message="Trạng thái không hợp lệ.")
    if tour.status == "PUBLISHED" and target != "PUBLISHED" and not form.get("confirm"):
        return page(request, "admin/catalog/tour_status.html", active_tab="tours", htx=claims.htx_code, tour=tour,
                    target=target, target_label=catalog.TOUR_STATUS_LABELS[target],
                    holding=catalog.holding_departures(conn, claims.htx_code, tour_id))
    catalog.set_tour_status(conn, claims.htx_code, tour_id, target)
    return redirect(request, f"/tours/{tour_id}")


# ---------- photos ----------

def read_upload(form: FormData, field: str) -> bytes:
    """The bytes of one uploaded file, at most one byte over the limit (so media.process_image can refuse it); empty if none."""
    upload = form.get(field)
    return upload.file.read(media.MAX_BYTES + 1) if hasattr(upload, "file") else b""


@router.post("/tours/{tour_id}/photos")
def photo_upload(request: Request, tour_id: UUID, claims: Claims = manager, conn=Depends(db), form: FormData = Depends(form_of)):
    tour = tour_or_404(conn, claims, tour_id)
    data = read_upload(form, "photo")
    if not data:
        return tour_page(request, conn, claims, tour, 422, "Hãy chọn một ảnh để tải lên.")
    image = media.process_image(data)  # a def route runs in a worker thread, so decoding does not stall the server
    if isinstance(image, media.ImageRefusal):
        return tour_page(request, conn, claims, tour, 422, image.message)
    stored = media_store.add_tour_photo(conn, claims.htx_code, tour_id, image, claims.name or claims.sub)
    if isinstance(stored, media_store.MediaRefusal):
        return tour_page(request, conn, claims, tour, 404 if stored is media_store.MediaRefusal.NOT_FOUND else 409, stored.message)
    return redirect(request, f"/tours/{tour_id}")


@router.post("/tours/{tour_id}/photos/{media_id}/{action}")
def photo_action(request: Request, tour_id: UUID, media_id: UUID, action: str, claims: Claims = manager, conn=Depends(db)):
    if action not in ("cover", "up", "down", "remove"):
        raise HTTPException(404)
    tour_or_404(conn, claims, tour_id)
    if media_id not in [m.id for m in media_store.list_tour_media(conn, claims.htx_code, tour_id)]:
        raise HTTPException(404)
    if action == "cover":
        media_store.set_tour_cover(conn, claims.htx_code, tour_id, media_id)
    elif action == "remove":
        media_store.remove(conn, claims.htx_code, tour_id, media_id)
    else:
        media_store.move(conn, claims.htx_code, tour_id, media_id, action)  # False at the ends: nothing to do
    return redirect(request, f"/tours/{tour_id}")


# ---------- departures ----------

CORE_DOWN = "Chưa tải được danh sách nông hộ từ hệ thống. Chuyến vẫn lưu được, nhưng chưa chọn hoặc đổi được người dẫn; thử lại sau ít phút."
NO_ACCOUNT = "Nông hộ này chưa có tài khoản đăng nhập nên chưa làm người dẫn được."
SHOWS = (("upcoming", "Sắp tới"), ("past", "Đã diễn ra"), ("cancelled", "Đã huỷ"), ("all", "Tất cả"))
Guide = tuple[str | None, str | None]


def households_or_error(authorization: str) -> tuple[list[core_client.Household], str]:
    """The cooperative's households, or [] and the message to show when the core does not answer (the page still opens)."""
    try:
        return core_client.list_households(authorization), ""
    except core_client.CoreError as exc:
        log.warning("Households unavailable: %s", exc)
        return [], CORE_DOWN


def read_guide(form: FormData, households: list[core_client.Household], core_error: str, errors: dict,
               keep: Guide | None = None) -> Guide | None:
    """The guide chosen in the form as (user id, name); (None, None) for nobody; None to leave the stored guide alone."""
    if "guide" not in form:
        return None  # the select was not drawn (core down): leave the guide as it is
    chosen = str(form.get("guide", ""))
    if chosen == "":
        return (None, None)
    if chosen == "keep" and keep is not None:
        return None
    if core_error:
        errors["guide"] = core_error
        return None
    household = next((h for h in households if h.id == chosen), None)
    if household is None:
        errors["guide"] = "Hãy chọn người dẫn trong danh sách nông hộ của HTX."
    elif not household.keycloak_user_id:
        errors["guide"] = NO_ACCOUNT
    else:
        return (household.keycloak_user_id, household.name)
    return None


def read_number(raw: str, low: int, high: int, default: int | None, name: str, message: str, errors: dict) -> int | None:
    raw = raw.strip()
    if raw == "" and default is not None:
        return default
    value = appkit.parse_int(raw, low, high)
    if value is None:
        errors[name] = message
    return value


SEATS_MESSAGE = "Số chỗ từ 1 đến 200."
ADULT_MESSAGE = "Giá người lớn từ 0 đến 10.000.000 ₫."
CHILD_MESSAGE = "Giá trẻ em từ 0 đến 10.000.000 ₫."
PRICE_MAX = catalog.PRICE_MAX


def parse_tour_choice(conn, claims: Claims, raw: str, errors: dict) -> catalog.Tour | None:
    try:
        tour = catalog.get_tour(conn, claims.htx_code, UUID(raw.strip()))
    except ValueError:
        tour = None
    if tour is None or tour.status == "ARCHIVED":
        errors["tour"] = "Hãy chọn tour trong danh sách (tour đã ngừng bán không thêm chuyến được)."
        return None
    return tour


def build_calendar(first: date, items: list[catalog.DepartureRow], today: date) -> list[dict]:
    """Whole weeks (Monday first) covering the month; each cell has its day and (time, departure) of that Vietnam day."""
    by_day: dict[date, list[tuple[str, catalog.DepartureRow]]] = {}
    for item in items:
        local = item.starts_at.astimezone(VN_TZ)
        by_day.setdefault(local.date(), []).append((local.strftime("%H:%M"), item))
    start = first - timedelta(days=first.weekday())
    after = catalog.add_months(first, 1)
    end = after + timedelta(days=(7 - after.weekday()) % 7)
    cells, day = [], start
    while day < end:
        cells.append({"day": day, "in_month": day.month == first.month, "today": day == today, "items": by_day.get(day, [])})
        day += timedelta(days=1)
    return cells


def departures_page(request: Request, conn, claims: Claims, households, core_error: str, status: int = 200, **extra):
    theme = theme_of(request)
    query = request.query_params
    view = "calendar" if query.get("view") == "calendar" else "list"
    show = query.get("show", "") if query.get("show", "") in catalog.SHOW_WHERE else "upcoming"
    try:
        tour_filter = UUID(query.get("tour", ""))
    except ValueError:
        tour_filter = None
    now = datetime.now(VN_TZ)
    context = {"view": view, "show": show, "shows": SHOWS, "tour_filter": tour_filter, "households": households,
               "core_error": core_error, "tours": catalog.tour_choices(conn, claims.htx_code), "weekdays": catalog.WEEKDAYS,
               "single_form": {}, "single_errors": {}, "bulk_form": {"weekdays": [], "time": "07:30"}, "bulk_errors": {},
               "tomorrow": (now + timedelta(days=1)).date().isoformat(), "now": now}
    if tour_filter is not None:
        context["single_form"] = {"tour": str(tour_filter)}
        context["bulk_form"] = {**context["bulk_form"], "tour": str(tour_filter)}
    context.update(extra)
    created = appkit.parse_int(query.get("created"), 1, 1000)
    if created:
        context["created"] = (created, appkit.parse_int(query.get("taken"), 0, 1000) or 0, appkit.parse_int(query.get("past"), 0, 1000) or 0)
    cancelled = appkit.parse_int(query.get("cancelled"), 0, 1000)
    if cancelled is not None and "cancelled" in query:
        context["cancelled_notice"] = cancelled
    if view == "calendar":
        first = catalog.month_start(query.get("month"), now.date())
        before, after = catalog.add_months(first, -1), catalog.add_months(first, 1)
        month_items = catalog.month_departures(conn, claims.htx_code, first, after, tour_filter)
        cal = {"first": first, "total": len(month_items), "cells": build_calendar(first, month_items, now.date()),
               "prev": href("/departures", theme, view="calendar", month=before.strftime("%Y-%m"), tour=tour_filter),
               "next": href("/departures", theme, view="calendar", month=after.strftime("%Y-%m"), tour=tour_filter),
               "today": href("/departures", theme, view="calendar", tour=tour_filter)}
        return page(request, "admin/catalog/departures.html", status, active_tab="departures", htx=claims.htx_code, calendar=cal, **context)
    page_info = appkit.page_of(query.get("page"), catalog.count_departures(conn, claims.htx_code, show, tour_filter))
    rows = catalog.list_departures(conn, claims.htx_code, show, tour_filter, page_info.size, page_info.offset)
    return page(request, "admin/catalog/departures.html", status, active_tab="departures", htx=claims.htx_code, rows=rows,
                page_info=page_info, links=paging_links(request, page_info, "/departures", show=show if show != "upcoming" else None, tour=tour_filter),
                **context)


@router.get("/departures")
def departures(request: Request, claims: Claims = manager, authorization: str = Header()):
    households, core_error = households_or_error(authorization)  # before the database: a slow core must not hold a connection
    with open_db() as conn:
        return departures_page(request, conn, claims, households, core_error)


@router.post("/departures")
def departure_create(request: Request, claims: Claims = manager, authorization: str = Header(), form: FormData = Depends(form_of)):
    households, core_error = households_or_error(authorization)
    errors: dict[str, str] = {}
    shown = {name: str(form.get(name, "")) for name in ("tour", "date", "time", "seats", "price_adult_vnd", "price_child_vnd", "guide")}
    with open_db() as conn:
        tour = parse_tour_choice(conn, claims, shown["tour"], errors)
        day, clock = appkit.parse_date(shown["date"].strip()), catalog.clock(shown["time"])
        if day is None:
            errors["date"] = "Ngày khởi hành không hợp lệ."
        if clock is None:
            errors["time"] = "Giờ khởi hành không hợp lệ (giờ:phút, ví dụ 07:30)."
        if day and clock and datetime.combine(day, clock, tzinfo=VN_TZ) <= datetime.now(VN_TZ):
            errors["date"] = "Giờ khởi hành phải ở tương lai."
        seats = read_number(shown["seats"], 1, 200, tour.default_seats if tour else None, "seats", SEATS_MESSAGE, errors)
        adult = read_number(shown["price_adult_vnd"], 0, PRICE_MAX, tour.price_adult_vnd if tour else None, "price_adult_vnd", ADULT_MESSAGE, errors)
        child = read_number(shown["price_child_vnd"], 0, PRICE_MAX, tour.price_child_vnd if tour else None, "price_child_vnd", CHILD_MESSAGE, errors)
        guide = read_guide(form, households, core_error, errors)
        if errors:
            return departures_page(request, conn, claims, households, core_error, 422, single_form=shown, single_errors=errors, open_form="single")
        departure_id = catalog.create_departure(conn, claims.htx_code, tour.id, datetime.combine(day, clock, tzinfo=VN_TZ),
                                                seats, adult, child, guide or (None, None))
    return redirect(request, f"/departures/{departure_id}")


@router.post("/departures/bulk")
def departure_bulk(request: Request, claims: Claims = manager, authorization: str = Header(), form: FormData = Depends(form_of)):
    households, core_error = households_or_error(authorization)
    errors: dict[str, str] = {}
    shown = {name: str(form.get(name, "")) for name in ("tour", "time", "first", "last", "seats", "price_adult_vnd", "price_child_vnd", "guide")}
    shown["weekdays"] = [w for w in form.getlist("weekdays") if w in dict(catalog.WEEKDAYS)]
    with open_db() as conn:
        tour = parse_tour_choice(conn, claims, shown["tour"], errors)
        if not shown["weekdays"]:
            errors["weekdays"] = "Chọn ít nhất một thứ trong tuần."
        clock = catalog.clock(shown["time"])
        if clock is None:
            errors["time"] = "Giờ khởi hành không hợp lệ (giờ:phút, ví dụ 07:30)."
        first, last = appkit.parse_date(shown["first"].strip()), appkit.parse_date(shown["last"].strip())
        if first is None:
            errors["first"] = "Ngày đầu không hợp lệ."
        if last is None:
            errors["last"] = "Ngày cuối không hợp lệ."
        if first and last and last < first:
            errors["last"] = "Ngày cuối phải bằng hoặc sau ngày đầu."
        elif first and last and (last - first).days > catalog.BULK_SPAN_DAYS:
            errors["last"] = f"Ngày đầu và ngày cuối cách nhau tối đa {catalog.BULK_SPAN_DAYS} ngày."
        seats = read_number(shown["seats"], 1, 200, tour.default_seats if tour else None, "seats", SEATS_MESSAGE, errors)
        adult = read_number(shown["price_adult_vnd"], 0, PRICE_MAX, tour.price_adult_vnd if tour else None, "price_adult_vnd", ADULT_MESSAGE, errors)
        child = read_number(shown["price_child_vnd"], 0, PRICE_MAX, tour.price_child_vnd if tour else None, "price_child_vnd", CHILD_MESSAGE, errors)
        guide = read_guide(form, households, core_error, errors)
        result = None
        if not errors:
            result = catalog.create_bulk(conn, claims.htx_code, tour, {int(w) for w in shown["weekdays"]}, clock, first, last,
                                         seats, adult, child, guide or (None, None))
            if isinstance(result, str):
                errors["form"] = result
        if errors:
            return departures_page(request, conn, claims, households, core_error, 422, bulk_form=shown, bulk_errors=errors, open_form="bulk")
    created, taken, past = result
    return redirect(request, "/departures", created=created, taken=taken, past=past)


def departure_or_404(conn, claims: Claims, departure_id: UUID) -> catalog.Departure:
    departure = catalog.get_departure(conn, claims.htx_code, departure_id)
    if departure is None:
        raise HTTPException(404)
    return departure


def refusal_status(refusal: core.Refusal) -> int:
    return 404 if refusal is core.Refusal.NOT_FOUND else 422 if refusal in (
        core.Refusal.INVALID_INPUT, core.Refusal.PARTY_SIZE, core.Refusal.REASON_REQUIRED) else 409


def checkin_state(booking: core.Booking, departure: catalog.Departure, ended: bool) -> str:
    """Per guest: present, absent (the trip is over and nobody checked them in) or still to come."""
    if booking.checked_in_at is not None:
        return "present"
    return "absent" if booking.status == "CONFIRMED" and ended else ""


def departure_page(request: Request, conn, claims: Claims, departure: catalog.Departure, households, core_error: str,
                   status: int = 200, error: str = "", **extra):
    now = datetime.now(VN_TZ)
    opens, closes = checkin_window(departure.starts_at, departure.duration_minutes)
    ended = now > departure.starts_at + timedelta(minutes=departure.duration_minutes)
    bookings = catalog.departure_bookings(conn, claims.htx_code, departure.id)
    holding = [b for b in bookings if b.status != "CANCELLED"]
    query = request.query_params
    done = None
    if query.get("done") in ("checkin", "undo"):
        match = next((b for b in bookings if b.code == query.get("code", "")), None)
        done = (query["done"], match) if match else None
    guide_known = departure.guide_user_id is None or any(h.keycloak_user_id == departure.guide_user_id for h in households)
    return page(request, "admin/catalog/departure.html", status, active_tab="departures", htx=claims.htx_code, departure=departure,
                holding=holding, cancelled=[b for b in bookings if b.status == "CANCELLED"], ended=ended, error=error,
                window_open=opens <= now <= closes and departure.status != "CANCELLED", window_opens=opens.date(),
                present=sum(b.checked_in_count or 0 for b in holding), households=households, core_error=core_error,
                guide_known=guide_known, done=done, form_values=extra.pop("form_values", None), errors=extra.pop("errors", {}),
                booking_labels=catalog.BOOKING_STATUS_LABELS, payment_labels=catalog.PAYMENT_LABELS, now=now,
                checkin_state=lambda b: checkin_state(b, departure, ended), **extra)


@router.get("/departures/{departure_id}")
def departure_detail(request: Request, departure_id: UUID, claims: Claims = manager, authorization: str = Header()):
    households, core_error = households_or_error(authorization)
    with open_db() as conn:
        departure = departure_or_404(conn, claims, departure_id)
        return departure_page(request, conn, claims, departure, households, core_error, notice_cancelled=appkit.parse_int(
            request.query_params.get("cancelled"), 0, 1000))


@router.post("/departures/{departure_id}")
def departure_update(request: Request, departure_id: UUID, claims: Claims = manager, authorization: str = Header(),
                     form: FormData = Depends(form_of)):
    households, core_error = households_or_error(authorization)
    with open_db() as conn:
        departure = departure_or_404(conn, claims, departure_id)
        if departure.status == "CANCELLED":
            return departure_page(request, conn, claims, departure, households, core_error, 409, "Chuyến đã huỷ không sửa được.")
        errors: dict[str, str] = {}
        shown = {name: str(form.get(name, "")) for name in ("seats", "price_adult_vnd", "price_child_vnd", "guide")}
        seats = read_number(shown["seats"], 1, 200, None, "seats", SEATS_MESSAGE, errors)
        adult = read_number(shown["price_adult_vnd"], 0, PRICE_MAX, None, "price_adult_vnd", ADULT_MESSAGE, errors)
        child = read_number(shown["price_child_vnd"], 0, PRICE_MAX, None, "price_child_vnd", CHILD_MESSAGE, errors)
        guide = read_guide(form, households, core_error, errors, keep=(departure.guide_user_id, departure.guide_name))
        if errors:
            return departure_page(request, conn, claims, departure, households, core_error, 422, form_values=shown, errors=errors)
        if seats != departure.seats:
            refusal = core.set_departure_seats(conn, claims.htx_code, departure_id, seats)
            if refusal:
                return departure_page(request, conn, claims, departure, households, core_error, refusal_status(refusal),
                                      form_values=shown, errors={"seats": refusal.message})
        catalog.update_departure(conn, claims.htx_code, departure_id, adult, child, guide)
    return redirect(request, f"/departures/{departure_id}")


@router.post("/departures/{departure_id}/status")
def departure_status(request: Request, departure_id: UUID, claims: Claims = manager, authorization: str = Header(),
                     form: FormData = Depends(form_of)):
    target = str(form.get("status", ""))
    households, core_error = households_or_error(authorization)
    with open_db() as conn:
        departure = departure_or_404(conn, claims, departure_id)
        if target in ("OPEN", "CLOSED"):
            refusal = catalog.set_open_closed(conn, claims.htx_code, departure_id, target)
            if refusal:
                message = "Chuyến đã huỷ không mở lại được." if refusal is core.Refusal.WRONG_STATE else refusal.message
                return departure_page(request, conn, claims, departure, households, core_error, refusal_status(refusal), message)
            return redirect(request, f"/departures/{departure_id}")
        if target != "CANCELLED":
            return page(request, "message.html", 422, message="Trạng thái không hợp lệ.")
        if departure.status == "CANCELLED":
            return departure_page(request, conn, claims, departure, households, core_error, 409, "Chuyến này đã huỷ rồi.")
        reason = str(form.get("reason", ""))
        if not form.get("confirm") or not reason.strip():
            core.sweep(conn, claims.htx_code, departure_id)  # holds that ran out are not worth counting
            bookings, people = catalog.holding_bookings(conn, claims.htx_code, departure_id)
            problem = "Cần ghi lý do huỷ chuyến." if form.get("confirm") else ""
            return page(request, "admin/catalog/departure_cancel.html", 422 if problem else 200, active_tab="departures",
                        htx=claims.htx_code, departure=departure, bookings=bookings, people=people, reason=reason, problem=problem)
        result = core.cancel_departure(conn, claims.htx_code, departure_id, reason, actor_of(claims, "MANAGER"))
        if isinstance(result, core.Refusal):
            bookings, people = catalog.holding_bookings(conn, claims.htx_code, departure_id)
            return page(request, "admin/catalog/departure_cancel.html", refusal_status(result), active_tab="departures",
                        htx=claims.htx_code, departure=departure, bookings=bookings, people=people, reason=reason, problem=result.message)
    return redirect(request, f"/departures/{departure_id}", cancelled=result)


@router.post("/departures/{departure_id}/checkin")
def departure_checkin(request: Request, departure_id: UUID, claims: Claims = manager, authorization: str = Header(),
                      form: FormData = Depends(form_of)):
    households, core_error = households_or_error(authorization)
    with open_db() as conn:
        departure = departure_or_404(conn, claims, departure_id)
        code = str(form.get("code", "")).strip()
        shown = {"code": code}
        if code:
            booking_id = catalog.booking_id_by_code(conn, claims.htx_code, departure_id, code)
            if booking_id is None:
                return departure_page(request, conn, claims, departure, households, core_error, 422, form_values=shown,
                                      errors={"code": "Không có mã này trong chuyến."})
        else:
            try:
                booking_id = UUID(str(form.get("booking_id", "")))
            except ValueError:
                return departure_page(request, conn, claims, departure, households, core_error, 422, form_values=shown,
                                      errors={"code": "Hãy nhập mã đặt chỗ."})
            if booking_id not in {b.id for b in catalog.departure_bookings(conn, claims.htx_code, departure_id)}:
                raise HTTPException(404)
        actor = actor_of(claims, "MANAGER")
        if form.get("undo"):
            result, kind = core.undo_check_in(conn, claims.htx_code, booking_id, actor), "undo"
        else:
            raw = str(form.get("count", "")).strip()
            count = appkit.parse_int(raw, 1, 200) if raw else None
            if raw and count is None:
                return departure_page(request, conn, claims, departure, households, core_error, 422, form_values=shown,
                                      errors={"code": core.Refusal.INVALID_INPUT.message})
            result, kind = core.check_in(conn, claims.htx_code, booking_id, count, actor), "checkin"
        if isinstance(result, core.Refusal):
            return departure_page(request, conn, claims, departure, households, core_error, refusal_status(result),
                                  error=result.message, form_values=shown)
    return redirect(request, f"/departures/{departure_id}", done=kind, code=result.code)


@router.get("/departures/{departure_id}/guests/export.csv")
def departure_csv(departure_id: UUID, claims: Claims = manager, conn=Depends(db)):
    departure = departure_or_404(conn, claims, departure_id)
    rows = []
    for b in catalog.departure_bookings(conn, claims.htx_code, departure_id):
        if b.status == "CANCELLED":
            continue
        present = f"Có mặt {b.checked_in_count}/{b.party_size}" if b.checked_in_at else ""
        rows.append((b.code, b.guest_name, b.phone, b.email, b.adults, b.children, catalog.BOOKING_STATUS_LABELS[b.status],
                     b.total_vnd, b.paid_vnd, catalog.PAYMENT_LABELS[b.payment_state], present, b.note))
    name = appkit.csv_filename("tea-tour", claims.htx_code, "khach-chuyen", departure.starts_at.astimezone(VN_TZ).date())
    return appkit.csv_response(name, ("Mã đặt chỗ", "Khách", "Điện thoại", "Email", "Người lớn", "Trẻ em", "Trạng thái", "Tổng tiền",
                                      "Đã trả", "Thanh toán", "Điểm danh", "Ghi chú của khách"), rows)


@router.get("/departures/{departure_id}/print")
def departure_print(request: Request, departure_id: UUID, claims: Claims = manager, conn=Depends(db)):
    departure = departure_or_404(conn, claims, departure_id)
    guests = [b for b in catalog.departure_bookings(conn, claims.htx_code, departure_id) if b.status == "CONFIRMED"]
    return page(request, "admin/catalog/departure_print.html", htx=claims.htx_code, departure=departure, guests=guests,
                back=appkit.shell_url("manager", "tea-tour", f"/departures/{departure_id}"),
                people=sum(b.party_size for b in guests))


# ---------- settings ----------

SETTINGS_FIELDS = ("display_name", "tagline", "intro", "hotline", "zalo", "email", "address", "map_url", "bank_bin", "bank_account",
                   "bank_holder", "deposit_percent", "hold_hours", "cancel_free_hours", "policy_text")
SAMPLE_AMOUNT = 10_000
SAMPLE_CONTENT = "TOUR MAU"


def settings_page(request: Request, conn, claims: Claims, shown: dict | None = None, errors: dict | None = None, status: int = 200,
                  cover_error: str = ""):
    current = settings.get(conn, claims.htx_code)
    if shown is None:
        shown = {name: str(getattr(current, name)) for name in SETTINGS_FIELDS}
        shown["auto_confirm"] = current.auto_confirm
    sample = None
    if current.bank_ready:  # the preview shows what is saved, so it matches what guests will scan
        sample = qr.qr_data_uri(vietqr.payload(current.bank_bin, current.bank_account, SAMPLE_AMOUNT, SAMPLE_CONTENT))
    saved = request.query_params.get("saved", "")
    return page(request, "admin/catalog/settings.html", status, active_tab="settings", htx=claims.htx_code, current=current,
                shown=shown, errors=errors or {}, banks=vietqr.BANKS, sample=sample, sample_amount=SAMPLE_AMOUNT,
                sample_content=SAMPLE_CONTENT, saved=saved if saved in ("1", "cover") else "", cover_error=cover_error,
                image_limits="JPEG tối đa 16 triệu điểm ảnh; PNG và WebP tối đa 6 triệu điểm ảnh (khoảng 3000 x 2000). Tệp tối đa 5 MB.")


@router.get("/settings")
def settings_view(request: Request, claims: Claims = manager, conn=Depends(db)):
    return settings_page(request, conn, claims)


@router.post("/settings")
def settings_save(request: Request, claims: Claims = manager, conn=Depends(db), form: FormData = Depends(form_of)):
    shown = {name: str(form.get(name, "")) for name in SETTINGS_FIELDS}
    shown["auto_confirm"] = bool(form.get("auto_confirm"))
    errors = settings.save(conn, claims.htx_code, {**shown, "auto_confirm": "on" if shown["auto_confirm"] else ""})
    if errors:
        return settings_page(request, conn, claims, shown, errors, 422)
    return redirect(request, "/settings", saved="1")


@router.post("/settings/cover")
def settings_cover(request: Request, claims: Claims = manager, conn=Depends(db), form: FormData = Depends(form_of)):
    data = read_upload(form, "photo")
    if not data:
        return settings_page(request, conn, claims, status=422, cover_error="Hãy chọn một ảnh để tải lên.")
    image = media.process_image(data)
    if isinstance(image, media.ImageRefusal):
        return settings_page(request, conn, claims, status=422, cover_error=image.message)
    stored = media_store.add_site_cover(conn, claims.htx_code, image, claims.name or claims.sub)
    if isinstance(stored, media_store.MediaRefusal):
        return settings_page(request, conn, claims, status=409, cover_error=stored.message)
    return redirect(request, "/settings", saved="cover")
