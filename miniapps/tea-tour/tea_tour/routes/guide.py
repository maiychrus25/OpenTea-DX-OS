# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Guide pages under /guide: my departures, the confirmed guests of one, check-in by button or by booking code."""
from uuid import UUID

from fastapi import APIRouter, Depends, Form, Request
from starlette.exceptions import HTTPException

from tea_tour.claims import Claims
from tea_tour.store import core, guide as store
from tea_tour.web import actor_of, db, page, redirect, role

router = APIRouter()

REASONS = {"BEFORE": "Chưa tới giờ điểm danh: mở từ 00:00 ngày khởi hành.",
           "AFTER": "Đã quá thời gian điểm danh của chuyến này."}


def _uuid(raw: str | None) -> UUID | None:
    try:
        return UUID(raw or "")
    except ValueError:
        return None


def _status(refusal: core.Refusal) -> int:
    if refusal is core.Refusal.NOT_FOUND:
        return 404
    return 422 if refusal in (core.Refusal.INVALID_INPUT, core.Refusal.PARTY_SIZE) else 409


def _departure_or_404(conn, claims: Claims, raw_id: str) -> store.GuideDeparture:
    departure_id = _uuid(raw_id)
    found = store.get_departure(conn, claims.htx_code, claims.sub, departure_id) if departure_id else None
    if found is None:
        raise HTTPException(404)  # another guide's, another cooperative's and a missing one look the same
    return found


def _departure_page(request: Request, conn, claims: Claims, departure: store.GuideDeparture, status: int = 200,
                    error: str = "", code: str = "", done: UUID | None = None, did: str = ""):
    guests = store.list_guests(conn, claims.htx_code, departure.id)
    banner = next((g for g in guests if g.id == done), None) if did in ("checkin", "undo") else None
    present = sum(g.checked_in_count or 0 for g in guests if g.checked_in_at)
    return page(request, "guide/departure.html", status, departure=departure, guests=guests, error=error,
                code=code, banner=banner, did=did, present=present, total=sum(g.party_size for g in guests),
                reason=REASONS.get(departure.window), cancelled=departure.status == "CANCELLED")


@router.get("/guide")
def schedule(request: Request, claims: Claims = Depends(role("farmer")), conn=Depends(db)):
    upcoming, past = store.list_departures(conn, claims.htx_code, claims.sub)
    return page(request, "guide/schedule.html", upcoming=upcoming, past=past, guide_name=claims.name)


@router.get("/guide/departures/{departure_id}")
def departure_page(request: Request, departure_id: str, done: str = "", did: str = "",
                   claims: Claims = Depends(role("farmer")), conn=Depends(db)):
    departure = _departure_or_404(conn, claims, departure_id)
    return _departure_page(request, conn, claims, departure, done=_uuid(done), did=did)


@router.post("/guide/departures/{departure_id}/checkin")
def checkin(request: Request, departure_id: str, action: str = Form(""), booking_id: str = Form(""),
            code: str = Form(""), count: str = Form(""), claims: Claims = Depends(role("farmer")), conn=Depends(db)):
    departure = _departure_or_404(conn, claims, departure_id)

    def refuse(refusal: core.Refusal, message: str = ""):
        return _departure_page(request, conn, claims, departure, _status(refusal), message or refusal.message,
                               code=code.strip()[:20])

    if action not in ("checkin", "undo", "code"):
        return refuse(core.Refusal.INVALID_INPUT)
    wanted = count.strip()
    if wanted and not (wanted.isascii() and wanted.isdigit()):
        return refuse(core.Refusal.INVALID_INPUT)
    people = int(wanted) if wanted else None  # None: the whole party
    if action == "code":
        if not code.strip():
            return refuse(core.Refusal.INVALID_INPUT)
        found = store.find_booking_id(conn, claims.htx_code, departure.id, code=code.strip().upper())
    else:
        found = store.find_booking_id(conn, claims.htx_code, departure.id, booking_id=_uuid(booking_id))
    if found is None:
        return refuse(core.Refusal.NOT_FOUND, "Không tìm thấy lượt đặt này trong chuyến. Kiểm tra lại mã khách đưa." if action == "code" else "")
    actor = actor_of(claims, "GUIDE")
    if action == "undo":
        result = core.undo_check_in(conn, claims.htx_code, found, actor, guide_user_id=claims.sub)
    else:
        result = core.check_in(conn, claims.htx_code, found, people, actor, guide_user_id=claims.sub)
    if isinstance(result, core.Refusal):
        return refuse(result)
    return redirect(request, f"/guide/departures/{departure.id}", done=str(found), did="undo" if action == "undo" else "checkin")
