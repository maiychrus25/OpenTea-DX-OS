# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Mini-app tea-experience: cẩm nang du lịch đồi chè (đặc tả docs/specs/2026-11-15-tea-experience-phase1-design.md).

The gateway strips /apps/tea-experience, so routes are /, /intro, /public/...; every link, form and redirect writes
the prefix back, because the browser goes through the web proxy and the gateway. Writes are POST + 303.
"""
import logging
import os
import re
import threading
from contextlib import contextmanager
from datetime import timedelta, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlencode
from uuid import UUID

from fastapi import Depends, FastAPI, Form, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException

from tea_experience import appkit, core_client, store
from tea_experience.claims import Claims, read_claims

PREFIX = "/apps/tea-experience"
TOUR_PREFIX = "/apps/tea-tour"  # the booking app: only a link, never a call
THEMES = ("light", "dark")  # the shell passes ?theme=; without it /dxos-app.css follows the system setting
VN_TZ = timezone(timedelta(hours=7))  # Asia/Ho_Chi_Minh: UTC+7 with no DST since 1975
HTX_RE = re.compile(r"[A-Za-z0-9_-]{1,20}")
COORD_RE = re.compile(r"-?[0-9]{1,3}(\.[0-9]{1,7})?")
MAX_SITES = 200
MAX_EXPERIENCES = 100
MONTHS = tuple(range(1, 13))
ERRORS = {401: "Cần đăng nhập để xem trang này.", 403: "Tài khoản của bạn không được vào trang này.",
          404: "Không có trang này.", 405: "Không có trang này.",
          503: "Hệ thống đang bận. Vui lòng thử lại sau ít phút."}
# Fixed keys only: ?notice= never carries free text into the page.
NOTICES = {"saved": "Đã lưu.", "deleted": "Đã xoá.", "shown": "Đã hiện.", "hidden": "Đã ẩn.",
           "synced": "Đã làm mới từ dữ liệu lõi.",
           "featured": "Đã đặt nổi bật.", "unfeatured": "Đã bỏ nổi bật.",
           "featured_full": f"Chỉ đặt tối đa {store.MAX_FEATURED} gói nổi bật. Bỏ nổi bật một gói khác trước.",
           "sync_failed": "Chưa lấy được dữ liệu mới từ lõi. Đang giữ bản cũ; nội dung bạn soạn vẫn còn nguyên."}
# What a failed refresh looks like to the manager, by the fixed code the core client raised.
CORE_FAILURES = {core_client.UNAVAILABLE: "Lõi không trả lời trong 5 giây.",
                 core_client.BAD_RESPONSE: "Lõi trả về dữ liệu không đúng dạng.",
                 core_client.NO_PROFILE: "Lõi chưa có hồ sơ của HTX này.",
                 core_client.WRONG_HTX: "Hồ sơ trong lõi không khớp với HTX của bạn."}
NO_TIME_YET = "Thông tin đang được cập nhật."
DB_MAX_CONNECTIONS = 8  # the app role allows 10; leaves room for ./dxos install and an admin
DB_WAIT_S = 2
DB_SLOTS = threading.BoundedSemaphore(DB_MAX_CONNECTIONS)
MONTH_NAMES = {m: f"Tháng {m}" for m in MONTHS}
PUBLIC_CSS = Path(__file__).parent / "static" / "tea-experience.css"

log = logging.getLogger("tea_experience")
# The root path (PREFIX) is set on the server, `uvicorn --root-path /apps/tea-experience`.
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


def href(path: str, theme: str = "", **params) -> str:
    query = {**params, **({"theme": theme} if theme else {})}
    return f"{PREFIX}{path}" + (f"?{urlencode(query)}" if query else "")


def tour_link(htx: str, theme: str = "") -> str:
    """The booking page of the same HTX in tea-tour (a browser link; this app never calls tea-tour)."""
    query = f"?{urlencode({'theme': theme})}" if theme else ""
    return f"{TOUR_PREFIX}/public/{htx}{query}"


def map_link(lat, lng) -> str | None:
    """An external map page centred on a point. Only numbers from our own validated columns reach the URL."""
    if lat is None or lng is None:
        return None
    lat6, lng6 = f"{Decimal(lat):.6f}", f"{Decimal(lng):.6f}"
    return f"https://www.openstreetmap.org/?mlat={lat6}&mlon={lng6}#map=16/{lat6}/{lng6}"


templates.env.globals.update(href=href, prefix=PREFIX, tour_link=tour_link, map_link=map_link,
                             month_names=MONTH_NAMES, months=MONTHS, no_time_yet=NO_TIME_YET)
templates.env.filters["vn_time"] = lambda t: t.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M")
templates.env.filters["vnd"] = lambda n: f"{n:,}".replace(",", ".") + " ₫"
templates.env.filters["num"] = appkit.number  # 12.5 -> "12,5"; the digits argument is passed as a filter argument
templates.env.filters["months_text"] = lambda ms: ", ".join(MONTH_NAMES[m] for m in ms) if ms else ""


def theme_of(request: Request) -> str:
    theme = request.query_params.get("theme", "")
    return theme if theme in THEMES else ""


def page(request: Request, name: str, status: int = 200, **context) -> HTMLResponse:
    return templates.TemplateResponse(request, name, {"theme": theme_of(request), **context}, status_code=status)


def redirect(request: Request, path: str, **params) -> RedirectResponse:
    return RedirectResponse(href(path, theme_of(request), **params), status_code=303)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return page(request, "message.html", exc.status_code, message=ERRORS.get(exc.status_code, "Có lỗi xảy ra."))


@app.exception_handler(RequestValidationError)
async def bad_path(request: Request, exc: RequestValidationError):
    # Only path ids are typed (form fields are read as text), so a validation error is a page that does not exist.
    return page(request, "message.html", 404, message=ERRORS[404])


@app.exception_handler(Exception)
async def server_error(request: Request, exc: Exception):
    # Starlette re-raises after this response, so uvicorn still logs the traceback; the visitor never sees it.
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


# ---------- Validation (pure helpers) ----------

def parse_coord(raw: str, limit: int) -> Decimal | None:
    """A decimal in [-limit, limit]; a comma is accepted for the point ("21,0285")."""
    text = raw.strip().replace(",", ".")
    if not COORD_RE.fullmatch(text):
        return None
    value = Decimal(text)
    return value if -limit <= value <= limit else None


def site_form(name: str = Form(""), description: str = Form(""), latitude: str = Form(""),
              longitude: str = Form(""), parcel_code: str = Form(""), sort_order: str = Form(""),
              public: str = Form("")) -> dict:
    return {"name": name, "description": description, "latitude": latitude, "longitude": longitude,
            "parcel_code": parcel_code, "sort_order": sort_order, "public": public}


def read_site_form(form: dict, parcels: dict[str, store.CoreParcel]) -> tuple[dict, list[str]]:
    """Validated values for store.create_site / update_site, and the Vietnamese errors."""
    errors = []
    name, description = form["name"].strip(), form["description"].strip()
    if not 1 <= len(name) <= 120:
        errors.append("Tên điểm cần từ 1 đến 120 ký tự.")
    if len(description) > 500:
        errors.append("Mô tả tối đa 500 ký tự.")
    sort_order = appkit.parse_int(form["sort_order"].strip() or "0", 0, 999)
    if sort_order is None:
        errors.append("Thứ tự phải là số từ 0 đến 999.")
    lat_raw, lng_raw = form["latitude"].strip(), form["longitude"].strip()
    parcel_code = form["parcel_code"].strip() or None
    lat = lng = None
    if lat_raw or lng_raw:
        if not (lat_raw and lng_raw):
            errors.append("Toạ độ cần cả vĩ độ và kinh độ, hoặc để trống cả hai.")
        else:
            lat, lng = parse_coord(lat_raw, 90), parse_coord(lng_raw, 180)
            if lat is None:
                errors.append("Vĩ độ phải là số từ -90 đến 90.")
            if lng is None:
                errors.append("Kinh độ phải là số từ -180 đến 180.")
    elif parcel_code:
        parcel = parcels.get(parcel_code)
        if parcel is None:
            errors.append("Thửa đã chọn không còn trong bản sao từ lõi. Làm mới từ lõi hoặc chọn lại.")
        else:  # no coordinates typed: copy the parcel's point, the manager can edit it afterwards
            lat, lng = parcel.centroid_lat, parcel.centroid_lng
    if errors:
        return {}, errors
    return {"name": name, "description": description or None, "latitude": lat, "longitude": lng,
            "parcel_code": parcel_code, "is_public": form["public"] == "1", "sort_order": sort_order}, []


def experience_form(name: str = Form(""), description: str = Form(""), duration_min: str = Form(""),
                    price_vnd: str = Form(""), sort_order: str = Form(""), months: list[str] = Form([]),
                    sites: list[str] = Form([]), visible: str = Form(""), featured: str = Form("")) -> dict:
    return {"name": name, "description": description, "duration_min": duration_min, "price_vnd": price_vnd,
            "sort_order": sort_order, "months": months, "sites": sites, "visible": visible, "featured": featured}


def read_experience_form(form: dict, known_sites: set[UUID]) -> tuple[dict, list[UUID], list[str]]:
    errors = []
    name, description = form["name"].strip(), form["description"].strip()
    if not 1 <= len(name) <= 120:
        errors.append("Tên gói cần từ 1 đến 120 ký tự.")
    if len(description) > 1000:
        errors.append("Mô tả tối đa 1000 ký tự.")
    duration = appkit.parse_int(form["duration_min"].strip(), 15, 1440)
    if duration is None:
        errors.append("Thời lượng phải từ 15 đến 1440 phút.")
    price = appkit.parse_int(form["price_vnd"].strip(), 0, 1_000_000_000)
    if price is None:
        errors.append("Giá tham khảo phải là số đồng từ 0 đến 1.000.000.000 ₫.")
    sort_order = appkit.parse_int(form["sort_order"].strip() or "0", 0, 999)
    if sort_order is None:
        errors.append("Thứ tự phải là số từ 0 đến 999.")
    month_values = set()
    for raw in form["months"]:
        month = appkit.parse_int(raw.strip(), 1, 12)
        if month is None:
            errors.append("Tháng phù hợp không hợp lệ.")
            break
        month_values.add(month)
    site_ids: list[UUID] = []
    for raw in form["sites"]:
        try:
            site_id = UUID(raw.strip())
        except ValueError:
            errors.append("Điểm đã chọn không hợp lệ.")
            break
        if site_id not in site_ids:
            site_ids.append(site_id)
    if any(site_id not in known_sites for site_id in site_ids):
        errors.append("Có điểm đã chọn không thuộc HTX của bạn.")
    if errors:
        return {}, [], errors
    return ({"name": name, "description": description or None, "duration_min": duration, "price_vnd": price,
             "months": sorted(month_values), "is_visible": form["visible"] == "1", "sort_order": sort_order,
             "is_featured": form.get("featured", "") == "1"},
            site_ids, [])


def season_values(notes: list[str]) -> tuple[dict[int, str | None], list[str]]:
    if len(notes) != 12:
        return {}, ["Biểu mẫu mùa vụ không đủ 12 tháng. Hãy tải lại trang rồi thử lại."]
    values, errors = {}, []
    for month, raw in zip(MONTHS, notes):
        text = raw.strip()
        if len(text) > 300:
            errors.append(f"Ghi chú {MONTH_NAMES[month].lower()} tối đa 300 ký tự.")
        values[month] = text or None
    return (values, []) if not errors else ({}, errors)


# ---------- Manager (soạn nội dung, làm mới từ lõi) ----------

MANAGER_TABS = (("home", "Tổng quan", "/"), ("intro", "Giới thiệu", "/intro"), ("sites", "Điểm tham quan", "/sites"),
                ("experiences", "Gói trải nghiệm", "/experiences"), ("seasons", "Mùa vụ", "/seasons"))


def tabs_for(theme: str) -> list[tuple[str, str, str]]:
    return [(key, label, href(path, theme)) for key, label, path in MANAGER_TABS]


def last_sync_view(last) -> dict | None:
    if last is None:
        return None
    return {"at": last.synced_at, "ok": last.result == "OK", "actor": last.actor, "parcels": last.parcels,
            "crops": last.crops, "skipped": last.skipped, "reason": CORE_FAILURES.get(last.detail or "")}


@app.get("/")
def manager_home(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    htx = claims.htx_code
    return page(request, "home.html", htx=htx, tabs=tabs_for(theme_of(request)), current="home",
                intro=store.get_intro(conn, htx), last=last_sync_view(store.last_sync(conn, htx)),
                stats=store.overview(conn, htx), notice=NOTICES.get(request.query_params.get("notice", "")))


def intro_form(intro_text: str = Form(""), locality: str = Form(""), certification: str = Form("")) -> dict:
    return {"intro_text": intro_text, "locality": locality, "certification": certification}


def read_intro_form(form: dict) -> tuple[dict, list[str]]:
    values = {"intro_text": form["intro_text"].strip(), "locality_public": form["locality"].strip(),
              "certification": form["certification"].strip()}
    errors = []
    if len(values["intro_text"]) > 2000:
        errors.append("Đoạn giới thiệu tối đa 2000 ký tự.")
    if len(values["locality_public"]) > 200:
        errors.append("Địa phương hiển thị tối đa 200 ký tự.")
    if len(values["certification"]) > 50:
        errors.append("Chứng nhận tối đa 50 ký tự.")
    values = {k: v or None for k, v in values.items()}
    return values, errors


def intro_view(request, conn, htx, status=200, errors=(), form=None):
    intro = store.get_intro(conn, htx)
    current = {"intro_text": (intro.intro_text or "") if intro else "",
               "locality": (intro.locality_public or "") if intro else "",
               "certification": (intro.certification or "") if intro else ""}
    return page(request, "intro.html", status, htx=htx, tabs=tabs_for(theme_of(request)), current="intro",
                intro=intro, last=last_sync_view(store.last_sync(conn, htx)), errors=errors,
                form=form if form is not None else current,
                notice=NOTICES.get(request.query_params.get("notice", "")))


@app.get("/intro")
def intro_page(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    return intro_view(request, conn, claims.htx_code)


@app.post("/intro")
def save_intro(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db),
               form: dict = Depends(intro_form)):
    values, errors = read_intro_form(form)
    if errors:
        return intro_view(request, conn, claims.htx_code, 400, errors, form)
    store.save_intro_fields(conn, claims.htx_code, values)
    return redirect(request, "/intro", notice="saved")


@app.post("/sync")
def sync_core(request: Request, claims: Claims = Depends(role("manager")), authorization: str | None = Header(None)):
    # role() has already refused a request without a token (401), so authorization is the bearer string here.
    """DL-11. The core is called before any database connection is taken, so a slow core holds no slot."""
    htx, actor = claims.htx_code, claims.name[:80]
    try:
        snapshot = core_client.fetch_snapshot(authorization, htx)
    except core_client.CoreError as exc:
        log.warning("Core refresh failed: %s", exc.code)
        with open_db() as conn:
            store.log_sync_failure(conn, htx, actor, exc.code)
        return redirect(request, "/intro", notice="sync_failed")
    with open_db() as conn:
        store.save_snapshot(conn, htx, actor, snapshot)
    return redirect(request, "/intro", notice="synced")


# Sites (điểm tham quan)

def sites_view(request, conn, htx, status=200, errors=(), form=None):
    return page(request, "sites.html", status, htx=htx, tabs=tabs_for(theme_of(request)), current="sites",
                sites=store.list_sites(conn, htx), parcels=store.core_parcels(conn, htx), errors=errors,
                form=form or {}, last=last_sync_view(store.last_sync(conn, htx)),
                notice=NOTICES.get(request.query_params.get("notice", "")))


@app.get("/sites")
def sites_page(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    return sites_view(request, conn, claims.htx_code)


@app.post("/sites")
def create_site(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db),
                form: dict = Depends(site_form)):
    htx = claims.htx_code
    if store.count_sites(conn, htx) >= MAX_SITES:
        return sites_view(request, conn, htx, 400, [f"Mỗi HTX tối đa {MAX_SITES} điểm."], form)
    parcels = {p.parcel_code: p for p in store.core_parcels(conn, htx)}
    values, errors = read_site_form(form, parcels)
    if errors:
        return sites_view(request, conn, htx, 400, errors, form)
    store.create_site(conn, htx, values)
    return redirect(request, "/sites", notice="saved")


def site_edit_view(request, conn, htx, site, status=200, errors=(), form=None):
    return page(request, "site_edit.html", status, htx=htx, tabs=tabs_for(theme_of(request)),
                current="sites", site=site, parcels=store.core_parcels(conn, htx), errors=errors,
                form=form if form is not None else _site_form_values(site))


def _site_form_values(site) -> dict:
    return {"name": site.name, "description": site.description or "",
            "latitude": str(site.latitude) if site.latitude is not None else "",
            "longitude": str(site.longitude) if site.longitude is not None else "",
            "parcel_code": site.parcel_code or "", "sort_order": str(site.sort_order),
            "public": "1" if site.is_public else ""}


def _site_or_404(conn, htx, site_id: UUID):
    site = store.get_site(conn, htx, site_id)
    if site is None:
        raise HTTPException(404)
    return site


@app.get("/sites/{site_id}/edit")
def edit_site_page(request: Request, site_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    htx = claims.htx_code
    return site_edit_view(request, conn, htx, _site_or_404(conn, htx, site_id))


@app.post("/sites/{site_id}/edit")
def edit_site(request: Request, site_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db),
              form: dict = Depends(site_form)):
    htx = claims.htx_code
    site = _site_or_404(conn, htx, site_id)
    parcels = {p.parcel_code: p for p in store.core_parcels(conn, htx)}
    values, errors = read_site_form(form, parcels)
    if errors:
        return site_edit_view(request, conn, htx, site, 400, errors, form)
    store.update_site(conn, htx, site_id, values)
    return redirect(request, "/sites", notice="saved")


@app.post("/sites/{site_id}/public")
def site_public(request: Request, site_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db),
                to: str = Form("")):
    public = to == "1"  # anything but "1" hides the point: the safe side
    if not store.set_site_public(conn, claims.htx_code, site_id, public):
        raise HTTPException(404)
    return redirect(request, "/sites", notice="shown" if public else "hidden")


@app.post("/sites/{site_id}/delete")
def delete_site(request: Request, site_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    if not store.delete_site(conn, claims.htx_code, site_id):
        raise HTTPException(404)
    return redirect(request, "/sites", notice="deleted")


# Experiences (gói trải nghiệm)

def experiences_view(request, conn, htx, status=200, errors=(), form=None):
    return page(request, "experiences.html", status, htx=htx, tabs=tabs_for(theme_of(request)),
                current="experiences", experiences=store.list_experiences(conn, htx),
                sites=store.list_sites(conn, htx), errors=errors, form=form or {"months": [], "sites": []},
                notice=NOTICES.get(request.query_params.get("notice", "")))


@app.get("/experiences")
def experiences_page(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    return experiences_view(request, conn, claims.htx_code)


@app.post("/experiences")
def create_experience(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db),
                      form: dict = Depends(experience_form)):
    htx = claims.htx_code
    if store.count_experiences(conn, htx) >= MAX_EXPERIENCES:
        return experiences_view(request, conn, htx, 400, [f"Mỗi HTX tối đa {MAX_EXPERIENCES} gói."], form)
    known = {s.id for s in store.list_sites(conn, htx)}
    values, site_ids, errors = read_experience_form(form, known)
    if values and values["is_featured"] and store.count_featured(conn, htx) >= store.MAX_FEATURED:
        errors = [featured_full_message()]
    if errors:
        return experiences_view(request, conn, htx, 400, errors, form)
    store.create_experience(conn, htx, values, site_ids)
    return redirect(request, "/experiences", notice="saved")


def experience_edit_view(request, conn, htx, exp, status=200, errors=(), form=None):
    return page(request, "experience_edit.html", status, htx=htx, tabs=tabs_for(theme_of(request)),
                current="experiences", exp=exp, sites=store.list_sites(conn, htx), errors=errors,
                form=form if form is not None else _experience_form_values(conn, htx, exp))


def featured_full_message() -> str:
    return NOTICES["featured_full"]


def _experience_form_values(conn, htx, exp) -> dict:
    return {"name": exp.name, "description": exp.description or "", "duration_min": str(exp.duration_min),
            "featured": "1" if exp.is_featured else "",
            "price_vnd": str(exp.price_vnd), "sort_order": str(exp.sort_order),
            "months": [str(m) for m in exp.months],
            "sites": [str(s) for s in store.linked_site_ids(conn, htx, exp.id)],
            "visible": "1" if exp.is_visible else ""}


def _experience_or_404(conn, htx, exp_id: UUID):
    exp = store.get_experience(conn, htx, exp_id)
    if exp is None:
        raise HTTPException(404)
    return exp


@app.get("/experiences/{exp_id}/edit")
def edit_experience_page(request: Request, exp_id: UUID, claims: Claims = Depends(role("manager")),
                         conn=Depends(db)):
    htx = claims.htx_code
    return experience_edit_view(request, conn, htx, _experience_or_404(conn, htx, exp_id))


@app.post("/experiences/{exp_id}/edit")
def edit_experience(request: Request, exp_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db),
                    form: dict = Depends(experience_form)):
    htx = claims.htx_code
    exp = _experience_or_404(conn, htx, exp_id)
    known = {s.id for s in store.list_sites(conn, htx)}
    values, site_ids, errors = read_experience_form(form, known)
    if values and values["is_featured"] and not exp.is_featured and \
            store.count_featured(conn, htx, exclude=exp_id) >= store.MAX_FEATURED:
        errors = [featured_full_message()]
    if errors:
        return experience_edit_view(request, conn, htx, exp, 400, errors, form)
    store.update_experience(conn, htx, exp_id, values, site_ids)
    return redirect(request, "/experiences", notice="saved")


@app.post("/experiences/{exp_id}/visible")
def experience_visible(request: Request, exp_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db),
                       to: str = Form("")):
    visible = to == "1"
    if not store.set_experience_visible(conn, claims.htx_code, exp_id, visible):
        raise HTTPException(404)
    return redirect(request, "/experiences", notice="shown" if visible else "hidden")


@app.post("/experiences/{exp_id}/featured")
def experience_featured(request: Request, exp_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db),
                        to: str = Form("")):
    htx = claims.htx_code
    exp = _experience_or_404(conn, htx, exp_id)
    featured = to == "1"  # anything but "1" removes the mark
    if featured and not exp.is_featured and store.count_featured(conn, htx) >= store.MAX_FEATURED:
        return redirect(request, "/experiences", notice="featured_full")
    store.set_experience_featured(conn, htx, exp_id, featured)
    return redirect(request, "/experiences", notice="featured" if featured else "unfeatured")


@app.post("/experiences/{exp_id}/delete")
def delete_experience(request: Request, exp_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    if not store.delete_experience(conn, claims.htx_code, exp_id):
        raise HTTPException(404)
    return redirect(request, "/experiences", notice="deleted")


# Seasons (lịch mùa vụ)

def seasons_view(request, conn, htx, status=200, errors=(), form=None):
    notes = store.season_notes(conn, htx)
    return page(request, "seasons.html", status, htx=htx, tabs=tabs_for(theme_of(request)),
                current="seasons", errors=errors, notes=[(m, MONTH_NAMES[m]) for m in MONTHS],
                form=form if form is not None else {"notes": [notes.get(m, "") for m in MONTHS]},
                hints=store.crop_hint(conn, htx), last=last_sync_view(store.last_sync(conn, htx)),
                notice=NOTICES.get(request.query_params.get("notice", "")))


@app.get("/seasons")
def seasons_page(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    return seasons_view(request, conn, claims.htx_code)


@app.post("/seasons")
def save_seasons(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db),
                 notes: list[str] = Form([])):
    values, errors = season_values(notes)
    if errors:
        return seasons_view(request, conn, claims.htx_code, 400, errors, {"notes": notes})
    store.save_season_notes(conn, claims.htx_code, values)
    return redirect(request, "/seasons", notice="saved")


# ---------- Farmer (chỉ đọc nội dung đang công khai) ----------

@app.get("/guide")
def guide(request: Request, claims: Claims = Depends(role("farmer")), conn=Depends(db)):
    htx = claims.htx_code
    return page(request, "guide.html", htx=htx, intro=store.get_intro(conn, htx),
                sites=store.list_sites(conn, htx, public_only=True),
                experiences=store.list_experiences(conn, htx, visible_only=True),
                public_href=href(f"/public/{htx}", theme_of(request)))


# ---------- Public (không token; không bao giờ lộ tên hộ, mã thửa, toạ độ thửa hay nội dung ẩn) ----------

def fit_months(experiences) -> set[int]:
    """Months a visible experience is run in: the months a visitor can go."""
    return {m for exp in experiences for m in exp.months}


def noted_rows(notes: dict[int, str]) -> list[tuple[int, str, str]]:
    return [(m, MONTH_NAMES[m], notes[m]) for m in MONTHS if notes.get(m)]


@app.get("/public/{htx}/style.css")
def public_style(htx: str = Depends(public_htx)):
    """The stylesheet of the public pages. It sits under /public/<htx>/ because the web only serves public paths
    that start with an HTX code the HTX has enabled; the CSP allows it (style-src 'self')."""
    return FileResponse(PUBLIC_CSS, media_type="text/css")


@app.get("/public/{htx}")
def public_home(request: Request, htx: str = Depends(public_htx), conn=Depends(db)):
    experiences = store.list_experiences(conn, htx, visible_only=True)
    notes = store.season_notes(conn, htx)
    return page(request, "public_home.html", htx=htx, intro=store.get_intro(conn, htx),
                sites=store.list_sites(conn, htx, public_only=True), experiences=experiences,
                featured=store.featured_experiences(conn, htx), related=store.public_site_names(conn, htx),
                fit=fit_months(experiences), rows=[(m, MONTH_NAMES[m], notes.get(m)) for m in MONTHS],
                noted=noted_rows(notes))


@app.get("/public/{htx}/sites")
def public_sites(request: Request, htx: str = Depends(public_htx), conn=Depends(db)):
    return page(request, "public_sites.html", htx=htx, intro=store.get_intro(conn, htx),
                sites=store.list_sites(conn, htx, public_only=True))


def public_filters(query) -> tuple[dict, list[str]]:
    """Bộ lọc gói trải nghiệm từ query. Giá trị sai bị bỏ (không lọc theo nó) và báo một dòng; không bao giờ vào SQL."""
    filters, bad = {"month": None, "q": "", "max_price": None, "sort": ""}, False
    month = query.get("month", "")
    if month:
        filters["month"] = appkit.parse_int(month, 1, 12)
        bad = bad or filters["month"] is None
    q = query.get("q", "").strip()
    if len(q) > 60:
        bad, q = True, ""
    filters["q"] = q
    price = query.get("max_price", "")
    if price:
        filters["max_price"] = appkit.parse_int(price, 0, 1_000_000_000)
        bad = bad or filters["max_price"] is None
    sort = query.get("sort", "")
    if sort not in ("", "price", "duration"):
        bad, sort = True, ""
    filters["sort"] = sort
    return filters, (["Có bộ lọc không hợp lệ, đã bỏ qua phần đó."] if bad else [])


@app.get("/public/{htx}/experiences")
def public_experiences(request: Request, htx: str = Depends(public_htx), conn=Depends(db)):
    filters, notices = public_filters(request.query_params)
    visible = store.list_experiences(conn, htx, visible_only=True)
    found = store.search_public_experiences(conn, htx, filters["month"], filters["q"], filters["max_price"],
                                            filters["sort"])
    return page(request, "public_experiences.html", htx=htx, intro=store.get_intro(conn, htx),
                experiences=found, total=len(visible), filters=filters, filter_notices=notices,
                months_offered=sorted(fit_months(visible)), related=store.public_site_names(conn, htx))


@app.get("/public/{htx}/experiences/{exp_id}")
def public_experience(request: Request, exp_id: UUID, htx: str = Depends(public_htx), conn=Depends(db)):
    exp = store.get_experience(conn, htx, exp_id, visible_only=True)
    if exp is None:
        raise HTTPException(404)
    return page(request, "public_experience.html", htx=htx, intro=store.get_intro(conn, htx), exp=exp,
                sites=store.linked_sites(conn, htx, exp_id, public_only=True))


@app.get("/public/{htx}/seasons")
def public_seasons(request: Request, htx: str = Depends(public_htx), conn=Depends(db)):
    notes = store.season_notes(conn, htx)
    experiences = store.list_experiences(conn, htx, visible_only=True)
    return page(request, "public_seasons.html", htx=htx, intro=store.get_intro(conn, htx),
                rows=[(m, MONTH_NAMES[m], notes.get(m)) for m in MONTHS], fit=fit_months(experiences),
                noted=noted_rows(notes))
