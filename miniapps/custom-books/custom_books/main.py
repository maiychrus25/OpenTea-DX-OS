# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Mini-app custom-books (Sổ tự tạo): trưởng HTX thiết kế sổ ghi chép không cần lập trình; mỗi sổ đã phát hành dùng như một app.

The gateway strips /apps/custom-books, so routes are /, /feed, /books..., /b/...; every link, form and redirect writes
the prefix back. Writes are POST + 303. Labels and values are only ever shown as text and never reach SQL.
"""
import logging
import os
import re
import threading
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlencode
from uuid import UUID

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException

from custom_books import appkit, book_templates, core_client, fields as fl, store
from custom_books.claims import Claims, read_claims

PREFIX = "/apps/custom-books"
THEMES = ("light", "dark")  # the shell passes ?theme=; without it /dxos-app.css follows the system setting
VN_TZ = timezone(timedelta(hours=7))  # Asia/Ho_Chi_Minh: UTC+7 with no DST
ERRORS = {401: "Cần đăng nhập để xem trang này.", 403: "Tài khoản của bạn không được vào trang này.",
          404: "Không có trang này.", 405: "Không có trang này.",
          503: "Hệ thống đang bận. Vui lòng thử lại sau ít phút."}
CORE_DOWN = "Không lấy được danh sách nông hộ từ hệ thống. Vui lòng tải lại trang sau ít phút."
# Fixed keys only: ?notice= never carries free text into the page.
NOTICES = {"saved": "Đã lưu thiết kế của sổ."}
BOOK_NOTICES = {"saved": "Đã ghi dòng vào sổ.", "deleted": "Đã xoá dòng.", "approved": "Đã duyệt dòng.",
                "rejected": "Đã từ chối dòng.", "unchanged": "Không có gì thay đổi: dòng đã được xử lý trước đó."}
RECORD_STATUS_NAMES = {"PENDING": "Chờ duyệt", "APPROVED": "Đã duyệt", "REJECTED": "Bị từ chối"}
Q_MAX = 80
FEED_MAX = 30
DB_MAX_CONNECTIONS = 8  # the app role allows 10; leaves room for ./dxos install and an admin
DB_WAIT_S = 2
DB_SLOTS = threading.BoundedSemaphore(DB_MAX_CONNECTIONS)
FIELD_TYPE_NAMES = {"text": "Chữ", "long_text": "Chữ dài", "number": "Số", "money": "Tiền (đồng)", "date": "Ngày",
                    "choice": "Lựa chọn", "yes_no": "Có / không", "household": "Nông hộ"}
ICON_NAMES = {"leaf": "Lá chè", "scale": "Cân", "shopping-bag": "Túi mua hàng", "package": "Gói hàng",
              "map-pinned": "Bản đồ", "users": "Nhóm người", "calendar": "Lịch", "clipboard-list": "Sổ ghi chép",
              "truck": "Xe tải", "sparkles": "Ngôi sao"}
ACCESS_NAMES = {"none": "Không dùng sổ này", "view": "Chỉ xem mọi dòng", "own": "Ghi và xem dòng của mình",
                "all": "Ghi và xem mọi dòng"}
STATUS_NAMES = {"DRAFT": "Đang soạn", "PUBLISHED": "Đang dùng", "ARCHIVED": "Ngừng dùng"}

log = logging.getLogger("custom_books")
# The root path (PREFIX) is set on the server, `uvicorn --root-path /apps/custom-books`.
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


def href(path: str, theme: str = "", **params) -> str:
    query = {**params, **({"theme": theme} if theme else {})}
    return f"{PREFIX}{path}" + (f"?{urlencode(query)}" if query else "")


templates.env.globals.update(href=href, prefix=PREFIX, field_type_names=FIELD_TYPE_NAMES, icon_names=ICON_NAMES,
                             access_names=ACCESS_NAMES, status_names=STATUS_NAMES, field_types=fl.FIELD_TYPES,
                             access_levels=fl.ACCESS_LEVELS, icons=fl.ICONS, display=fl.display,
                             record_status_names=RECORD_STATUS_NAMES)


def theme_of(request: Request) -> str:
    theme = request.query_params.get("theme", "")
    return theme if theme in THEMES else ""


def page(request: Request, name: str, status: int = 200, **context) -> HTMLResponse:
    return templates.TemplateResponse(request, name, {"theme": theme_of(request), **context}, status_code=status)


def redirect(request: Request, path: str, **params) -> RedirectResponse:
    return RedirectResponse(href(path, theme_of(request), **params), status_code=303)


def refuse(request: Request, status: int, message: str) -> HTMLResponse:
    return page(request, "message.html", status, message=message)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return refuse(request, exc.status_code, ERRORS.get(exc.status_code, "Có lỗi xảy ra."))


@app.exception_handler(RequestValidationError)
async def bad_path(request: Request, exc: RequestValidationError):
    # Only path ids are typed (form fields are read as text), so a validation error is a page that does not exist.
    return refuse(request, 404, ERRORS[404])


@app.exception_handler(Exception)
async def server_error(request: Request, exc: Exception):
    # Starlette re-raises after this response, so uvicorn still logs the traceback; the user never sees it.
    return refuse(request, 500, "Có lỗi xảy ra. Vui lòng thử lại sau.")


def signed_in(authorization: str | None = Header(None)) -> Claims:
    claims = read_claims(authorization)
    if claims is None:
        raise HTTPException(401)
    return claims


def role(*names: str):
    """The gateway already checks the role per prefix; this keeps the app safe if a route is ever widened."""
    def check(claims: Claims = Depends(signed_in)) -> Claims:
        if not set(names) & set(claims.roles) or not claims.htx_code:
            raise HTTPException(403)
        return claims
    return check


member = role("manager", "officer", "farmer")
manager = role("manager")


async def posted(request: Request) -> dict[str, str]:
    """The posted form as plain text (the design form has a variable number of inputs)."""
    form = await request.form()
    return {k: v for k, v in form.items() if isinstance(v, str)}


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


def households_or_error(authorization: str, claims: Claims) -> tuple[list[core_client.Household], str | None]:
    """Households the caller may use (Hasura applies the role: a farmer gets only their own). Fetched before any
    connection is opened, so a slow core never holds one of the few database slots."""
    top = "manager" if "manager" in claims.roles else "officer" if "officer" in claims.roles else "farmer"
    try:
        return core_client.list_households(authorization, top), None
    except core_client.CoreError as exc:
        log.warning("Households unavailable: %s", exc)
        return [], CORE_DOWN


def today() -> date:
    return datetime.now(VN_TZ).date()


def blank_entry(book: store.Book) -> dict[str, str]:
    """A new row's first values: the first date field starts at today."""
    first_date = next((f.key for f in book.fields if f.type == "date"), None)
    return {first_date: today().isoformat()} if first_date else {}


def book_or_404(conn, claims: Claims, book_id: UUID, lock: bool = False) -> store.Book:
    book = store.get_book(conn, claims.htx_code, book_id, lock)
    if book is None:
        raise HTTPException(404)
    return book


@app.get("/healthz", response_class=PlainTextResponse)
def healthz():
    return "ok"


# ---------- Home and feed (every role) ----------

def usable_books(conn, claims: Claims) -> list[store.Book]:
    """Published books whose level for the caller is not 'none', newest first."""
    return [b for b in store.list_books(conn, claims.htx_code, "PUBLISHED")
            if fl.level_for(claims.roles, b.officer_access, b.farmer_access) != "none"]


@app.get("/")
def home(request: Request, claims: Claims = Depends(member), conn=Depends(db)):
    return page(request, "home.html", books=usable_books(conn, claims), is_manager="manager" in claims.roles,
                htx=claims.htx_code)


@app.get("/feed")
def feed(claims: Claims = Depends(member), conn=Depends(db)):
    """The books of the caller's role as sub-apps for the platform menu (a contract the web validates strictly)."""
    entries = [{"label": b.name[:60], "path": f"/b/{b.id}", "icon": b.icon, "description": b.description[:200]}
               for b in usable_books(conn, claims)[:FEED_MAX]]
    body: dict = {"entries": entries}
    if "manager" in claims.roles:
        body["create"] = {"label": "Tạo sổ mới", "path": "/books/new"}
    return JSONResponse(body)


# ---------- Designing books (manager) ----------

@app.get("/books")
def books_list(request: Request, claims: Claims = Depends(manager), conn=Depends(db)):
    books = store.list_books(conn, claims.htx_code)
    groups = [(key, STATUS_NAMES[key], [b for b in books if b.status == key]) for key in ("DRAFT", "PUBLISHED", "ARCHIVED")]
    return page(request, "books.html", groups=groups, total=len(books), htx=claims.htx_code, max_books=fl.MAX_BOOKS)


@app.get("/books/new")
def books_new(request: Request, claims: Claims = Depends(manager)):
    return page(request, "new.html", choices=list(book_templates.TEMPLATES.values()), blank=book_templates.BLANK)


@app.post("/books")
def books_create(request: Request, claims: Claims = Depends(manager), form: dict = Depends(posted),
                 conn=Depends(db)):
    key = form.get("template", "")
    if key != "blank" and key not in book_templates.TEMPLATES:
        return refuse(request, 400, "Mẫu sổ không hợp lệ. Hãy chọn một mẫu trong danh sách.")
    book_id = store.create_book(conn, claims.htx_code, claims.sub, key)
    if book_id is None:
        return refuse(request, 409, f"HTX đã có {fl.MAX_BOOKS} sổ, là số tối đa. Hãy xoá hoặc dùng lại một sổ cũ.")
    return redirect(request, f"/books/{book_id}/design")


def design_rows(book: store.Book, form: dict | None):
    """Rows for the design page: the saved ones, or the posted ones again; a field that has data shows its fixed type."""
    if form is None:
        rows = fl.rows_of(book.fields)
    else:
        rows = fl.form_rows(form)
    kinds = {f.key: f.type for f in book.fields}
    for row in rows:
        row["locked"] = bool(row["key"] in kinds and book.record_count > 0)
        if row["locked"]:
            row["type"] = kinds[row["key"]]
    return rows


def design_page(request, book: store.Book, form: dict | None = None, errors: dict | None = None, status: int = 200):
    settings = ({"name": book.name, "description": book.description, "icon": book.icon,
                 "officer_access": book.officer_access, "farmer_access": book.farmer_access,
                 "approval": book.approval} if form is None else
                {**{k: form.get(k, "") for k in ("name", "description", "icon", "officer_access", "farmer_access")},
                 "approval": "approval" in form})
    return page(request, "design.html", status, book=book, rows=design_rows(book, form), form=settings,
                errors=errors or {}, notice=NOTICES.get(request.query_params.get("notice", "")),
                max_fields=fl.MAX_FIELDS, max_list=fl.MAX_LIST)


@app.get("/books/{book_id}/design")
def design(request: Request, book_id: UUID, claims: Claims = Depends(manager), conn=Depends(db)):
    return design_page(request, book_or_404(conn, claims, book_id))


@app.post("/books/{book_id}/design")
def design_save(request: Request, book_id: UUID, claims: Claims = Depends(manager), form: dict = Depends(posted)):
    with open_db() as conn, conn.transaction():
        book = book_or_404(conn, claims, book_id, lock=True)
        settings, errors = fl.parse_settings(form)
        new_fields, next_key, field_errors = fl.parse_design(form, book.fields, book.next_key, book.record_count > 0)
        errors.update(field_errors)
        if errors:
            return design_page(request, book, form, errors, 400)
        store.save_design(conn, claims.htx_code, book_id, settings, new_fields, next_key)
    return redirect(request, f"/books/{book_id}/design", notice="saved")


@app.get("/books/{book_id}/preview")
def preview(request: Request, book_id: UUID, claims: Claims = Depends(manager), authorization: str = Header()):
    households, core_error = households_or_error(authorization, claims)
    with open_db() as conn:
        book = book_or_404(conn, claims, book_id)
    return page(request, "preview.html", book=book, fields=book.fields, form=blank_entry(book), errors={},
                households=households, core_error=core_error)


@app.post("/books/{book_id}/publish")
def publish(request: Request, book_id: UUID, claims: Claims = Depends(manager), conn=Depends(db)):
    book = book_or_404(conn, claims, book_id)
    if not book.fields:
        return design_page(request, book, None, {"form": "Sổ cần có ít nhất một ô trước khi phát hành."}, 400)
    if not store.set_status(conn, claims.htx_code, book_id, "PUBLISHED", ("DRAFT", "ARCHIVED", "PUBLISHED")):
        raise HTTPException(404)
    return redirect(request, f"/b/{book_id}")


@app.post("/books/{book_id}/archive")
def archive(request: Request, book_id: UUID, claims: Claims = Depends(manager), conn=Depends(db)):
    book_or_404(conn, claims, book_id)
    if not store.set_status(conn, claims.htx_code, book_id, "ARCHIVED", ("PUBLISHED",)):
        return refuse(request, 409, "Chỉ sổ đang dùng mới ngừng dùng được.")
    return redirect(request, "/books")


@app.post("/books/{book_id}/delete")
def delete(request: Request, book_id: UUID, claims: Claims = Depends(manager), conn=Depends(db)):
    outcome = store.delete_book(conn, claims.htx_code, book_id)
    if outcome == "missing":
        raise HTTPException(404)
    if outcome == "has_records":
        return refuse(request, 409, "Sổ đã có dòng nên không xoá được. Hãy chọn Ngừng dùng để gỡ sổ khỏi menu mà vẫn giữ dữ liệu.")
    return redirect(request, "/books")


# ---------- Using a book (every role with a level) ----------

def load_book(conn, claims: Claims, book_id: UUID) -> tuple[store.Book, str]:
    """The book and the caller's level. A draft or archived book exists only for the manager; level 'none' is 403."""
    book = book_or_404(conn, claims, book_id)
    is_manager = "manager" in claims.roles
    if book.status != "PUBLISHED" and not is_manager:
        raise HTTPException(404)
    level = fl.level_for(claims.roles, book.officer_access, book.farmer_access)
    if level == "none":
        raise HTTPException(403)
    return book, level


def owner_of(claims: Claims, level: str) -> str | None:
    """The author whose rows the caller is limited to (level 'own'), else None for every row."""
    return claims.sub if level == "own" and "manager" not in claims.roles else None


def can_write(claims: Claims, level: str) -> bool:
    return "manager" in claims.roles or level in ("own", "all")


def can_edit(claims: Claims, book: store.Book, level: str, record: store.Record) -> bool:
    if "manager" in claims.roles:
        return True
    return (level in ("own", "all") and record.created_by == claims.sub
            and not (book.approval and record.status == "APPROVED"))


def locked_for(claims: Claims, book: store.Book) -> tuple[str, ...]:
    return () if "manager" in claims.roles or not book.approval else ("APPROVED",)


def writer_or_403(claims: Claims, level: str) -> None:
    if not can_write(claims, level):
        raise HTTPException(403)


def visible_record(conn, claims: Claims, book: store.Book, level: str, record_id: UUID) -> store.Record:
    record = store.get_record(conn, claims.htx_code, book.id, record_id)
    owner = owner_of(claims, level)
    if record is None or (owner is not None and record.created_by != owner):
        raise HTTPException(404)  # a row you may not see does not exist for you
    return record


def book_households(book: store.Book, authorization: str, claims: Claims):
    """Households of the caller (a farmer gets only their own), only when the book has a household field."""
    if not any(f.type == "household" for f in book.fields):
        return [], None
    return households_or_error(authorization, claims)


def name_map(households, records=()) -> dict[str, str]:
    """Household names by id: the names saved with the rows, overridden by the live lookup (which may know fewer
    households, e.g. a farmer's own only)."""
    names = {r.household_id: r.household_name for r in records if r.household_id and r.household_name}
    names.update({h.id: h.name for h in households})
    return names


def read_filters(request: Request, book: store.Book) -> tuple[store.Filters, dict[str, str]]:
    """Filters from the query string; anything that does not fit is ignored. Also the parameters to keep in links."""
    query = request.query_params
    q = query.get("q", "").strip()[:Q_MAX]
    start, end = appkit.parse_date(query.get("from")), appkit.parse_date(query.get("to"))
    choices = tuple((f.key, query[f"c_{f.key}"]) for f in book.fields
                    if f.type == "choice" and query.get(f"c_{f.key}") in f.options)
    household = query.get("household", "")[:64]
    status = query.get("status", "") if book.approval and query.get("status") in store.RECORD_STATUSES else ""
    params = {**({"q": q} if q else {}), **({"from": start.isoformat()} if start else {}),
              **({"to": end.isoformat()} if end else {}), **{f"c_{k}": v for k, v in choices},
              **({"household": household} if household else {}), **({"status": status} if status else {})}
    return store.Filters(q, start, end, choices, household, status), params


def paging_links(page_info: appkit.Page, theme: str, path: str, params: dict) -> tuple[str | None, str | None]:
    prev_href = href(path, theme, **params, page=page_info.number - 1) if page_info.has_prev else None
    next_href = href(path, theme, **params, page=page_info.number + 1) if page_info.has_next else None
    return prev_href, next_href


def book_tabs(book: store.Book, claims: Claims, theme: str) -> list[tuple[str, str, str]]:
    tabs = [("list", "Danh sách", href(f"/b/{book.id}", theme)), ("summary", "Tổng hợp", href(f"/b/{book.id}/summary", theme))]
    if "manager" in claims.roles:
        tabs.append(("design", "Thiết kế", href(f"/books/{book.id}/design", theme)))
    return tabs


@app.get("/b/{book_id}")
def book_list(request: Request, book_id: UUID, claims: Claims = Depends(member), authorization: str = Header()):
    with open_db() as conn:
        book, level = load_book(conn, claims, book_id)
    households, core_error = book_households(book, authorization, claims)
    flt, params = read_filters(request, book)
    owner, theme = owner_of(claims, level), theme_of(request)
    with open_db() as conn:
        page_info = appkit.page_of(request.query_params.get("page"), store.count_records(conn, claims.htx_code, book, owner, flt))
        records = store.list_records(conn, claims.htx_code, book, owner, flt, page_info.size, page_info.offset)
        count, totals = store.sums(conn, claims.htx_code, book, owner, flt)
    names = name_map(households, records)
    columns = [f for f in book.fields if f.in_list]
    first_date = next((f for f in book.fields if f.type == "date"), None)
    show_date = first_date is None or not first_date.in_list  # the row's date is that field; do not show it twice
    rows = [{"record": r, "cells": [fl.display(f, r.data.get(f.key), names) for f in columns],
             "can_edit": can_edit(claims, book, level, r),
             "can_decide": "manager" in claims.roles and book.approval and r.status == "PENDING"} for r in records]
    stats = [{"label": "Số dòng", "value": appkit.number(count, 0),
              "hint": "đã duyệt, khớp bộ lọc" if book.approval else "khớp bộ lọc"}]
    stats += [{"label": f"Tổng {f.label.lower()}", "value": fl.display(f, totals[f.key], names)} for f in book.fields if f.summary]
    return page(request, "book.html", book=book, level=level, columns=columns, rows=rows, stats=stats, params=params,
                page_info=page_info, links=paging_links(page_info, theme, f"/b/{book.id}", params), show_date=show_date,
                filtered=bool(params), households=households, core_error=core_error,
                can_write=can_write(claims, level) and book.status == "PUBLISHED",
                tabs=book_tabs(book, claims, theme), current="list", htx=claims.htx_code,
                notice=BOOK_NOTICES.get(request.query_params.get("notice", "")), statuses=RECORD_STATUS_NAMES,
                is_manager="manager" in claims.roles)


def form_from_data(book: store.Book, data: dict) -> dict[str, str]:
    """A saved row as the text of its inputs (a number shows its decimal comma)."""
    form = {}
    for f in book.fields:
        value = data.get(f.key)
        if value is None or value == "" or (f.type == "yes_no" and not value):
            continue
        form[f.key] = "on" if f.type == "yes_no" else str(value).replace(".", ",") if f.type == "number" else str(value)
    return form


def with_stored_household(households, record):
    """An edited row may keep a household the live lookup no longer has (its saved name is shown)."""
    if record and record.household_id and record.household_name and all(h.id != record.household_id for h in households):
        return [*households, core_client.Household(record.household_id, record.household_name, None)]
    return households


def entry_page(request, book, claims, households, core_error, record=None, form=None, errors=None, status=200):
    households = with_stored_household(households, record)
    return page(request, "entry.html", status, book=book, fields=book.fields, record=record, households=households,
                core_error=core_error, form=form if form is not None else blank_entry(book), errors=errors or {})


@app.get("/b/{book_id}/new")
def entry_new(request: Request, book_id: UUID, claims: Claims = Depends(member), authorization: str = Header()):
    with open_db() as conn:
        book, level = load_book(conn, claims, book_id)
    writer_or_403(claims, level)
    households, core_error = book_households(book, authorization, claims)
    return entry_page(request, book, claims, households, core_error)


def row_meta(book: store.Book, values: dict) -> tuple:
    """Date and household of a row: the first date field (else today) and the first household field."""
    day_key = next((f.key for f in book.fields if f.type == "date"), None)
    household_key = next((f.key for f in book.fields if f.type == "household"), None)
    day = appkit.parse_date(values.get(day_key)) if day_key else None
    return day or today(), values.get(household_key) if household_key else None


@app.post("/b/{book_id}/records")
def entry_create(request: Request, book_id: UUID, claims: Claims = Depends(member), authorization: str = Header(),
                 form: dict = Depends(posted)):
    with open_db() as conn:
        book, level = load_book(conn, claims, book_id)
    writer_or_403(claims, level)
    if book.status != "PUBLISHED":
        return refuse(request, 409, "Sổ chưa phát hành hoặc đã ngừng dùng nên chưa ghi được dòng mới.")
    households, core_error = book_households(book, authorization, claims)
    names = {h.id: h.name for h in households}
    values, errors = fl.parse_values(book.fields, form, None if core_error else names)
    if errors:
        return entry_page(request, book, claims, households, core_error, form=form, errors=errors, status=400)
    day, household_id = row_meta(book, values)
    status = "PENDING" if book.approval and "manager" not in claims.roles else "APPROVED"  # the manager is the approver
    with open_db() as conn:
        store.insert_record(conn, claims.htx_code, book.id, claims.sub, claims.name, values, day, household_id,
                            names.get(household_id), status)
    return redirect(request, f"/b/{book_id}", notice="saved")


@app.get("/b/{book_id}/r/{record_id}/edit")
def edit_form(request: Request, book_id: UUID, record_id: UUID, claims: Claims = Depends(member),
              authorization: str = Header()):
    with open_db() as conn:
        book, level = load_book(conn, claims, book_id)
        record = visible_record(conn, claims, book, level, record_id)
    if not can_edit(claims, book, level, record):
        raise HTTPException(403)
    households, core_error = book_households(book, authorization, claims)
    return entry_page(request, book, claims, households, core_error, record, form_from_data(book, record.data))


@app.post("/b/{book_id}/r/{record_id}/edit")
def edit_save(request: Request, book_id: UUID, record_id: UUID, claims: Claims = Depends(member),
              authorization: str = Header(), form: dict = Depends(posted)):
    with open_db() as conn:
        book, level = load_book(conn, claims, book_id)
        record = visible_record(conn, claims, book, level, record_id)
    if not can_edit(claims, book, level, record):
        raise HTTPException(403)
    households, core_error = book_households(book, authorization, claims)
    names = {h.id: h.name for h in with_stored_household(households, record)}
    values, errors = fl.parse_values(book.fields, form, None if core_error else names)
    if errors:
        return entry_page(request, book, claims, households, core_error, record, form, errors, 400)
    day, household_id = row_meta(book, values)
    # The manager's edit keeps the status; an author's edit sends the row (back) to the manager when approval is on.
    status = record.status if "manager" in claims.roles else "PENDING" if book.approval else "APPROVED"
    with open_db() as conn:
        done = store.update_record(conn, claims.htx_code, book.id, record_id, values, day, household_id,
                                   names.get(household_id), status, None if "manager" in claims.roles else claims.sub, locked_for(claims, book))
    if not done:
        raise HTTPException(403)  # approved a moment ago
    return redirect(request, f"/b/{book_id}", notice="saved")


@app.get("/b/{book_id}/r/{record_id}/delete")
def delete_confirm(request: Request, book_id: UUID, record_id: UUID, claims: Claims = Depends(member),
                   authorization: str = Header()):
    with open_db() as conn:
        book, level = load_book(conn, claims, book_id)
        record = visible_record(conn, claims, book, level, record_id)
    if not can_edit(claims, book, level, record):
        raise HTTPException(403)
    households, _ = book_households(book, authorization, claims)
    names = name_map(households, [record])
    summary = [(f.label, fl.display(f, record.data.get(f.key), names)) for f in book.fields if f.in_list]
    return page(request, "delete.html", book=book, record=record, summary=summary)


@app.post("/b/{book_id}/r/{record_id}/delete")
def delete_record(request: Request, book_id: UUID, record_id: UUID, claims: Claims = Depends(member)):
    with open_db() as conn:
        book, level = load_book(conn, claims, book_id)
        record = visible_record(conn, claims, book, level, record_id)
        if not can_edit(claims, book, level, record):
            raise HTTPException(403)
        if not store.delete_record(conn, claims.htx_code, book.id, record_id,
                                   None if "manager" in claims.roles else claims.sub, locked_for(claims, book)):
            raise HTTPException(403)
    return redirect(request, f"/b/{book_id}", notice="deleted")


def decide_row(request, claims, book_id, record_id, status, reason, from_statuses):
    with open_db() as conn:
        book = book_or_404(conn, claims, book_id)
        if not book.approval:
            return refuse(request, 409, "Sổ này không cần duyệt.")
        if store.get_record(conn, claims.htx_code, book.id, record_id) is None:
            raise HTTPException(404)
        changed = store.decide(conn, claims.htx_code, book.id, record_id, status, reason, claims.name, from_statuses)
    return redirect(request, f"/b/{book_id}", notice=("approved" if status == "APPROVED" else "rejected") if changed else "unchanged")


@app.post("/b/{book_id}/r/{record_id}/approve")
def approve(request: Request, book_id: UUID, record_id: UUID, claims: Claims = Depends(manager)):
    return decide_row(request, claims, book_id, record_id, "APPROVED", None, ("PENDING", "REJECTED"))


def pending_row_for_reject(conn, claims: Claims, book_id: UUID, record_id: UUID):
    book = book_or_404(conn, claims, book_id)
    if not book.approval:
        raise HTTPException(409)
    record = store.get_record(conn, claims.htx_code, book.id, record_id)
    if record is None:
        raise HTTPException(404)
    return book, record


def reject_page(request, book, record, households, form, errors=None, status=200):
    names = name_map(households, [record])
    summary = [(f.label, fl.display(f, record.data.get(f.key), names)) for f in book.fields if f.in_list]
    return page(request, "reject.html", status, book=book, record=record, summary=summary, form=form,
                errors=errors or {})


@app.get("/b/{book_id}/r/{record_id}/reject")
def reject_form(request: Request, book_id: UUID, record_id: UUID, claims: Claims = Depends(manager),
                authorization: str = Header()):
    with open_db() as conn:
        book, record = pending_row_for_reject(conn, claims, book_id, record_id)
    if record.status != "PENDING":
        return refuse(request, 409, BOOK_NOTICES["unchanged"])
    households, _ = book_households(book, authorization, claims)
    return reject_page(request, book, record, households, {})


@app.post("/b/{book_id}/r/{record_id}/reject")
def reject(request: Request, book_id: UUID, record_id: UUID, claims: Claims = Depends(manager),
           authorization: str = Header(), form: dict = Depends(posted)):
    reason = form.get("reason", "").strip()
    if not 1 <= len(reason) <= 200:
        with open_db() as conn:
            book, record = pending_row_for_reject(conn, claims, book_id, record_id)
        households, _ = book_households(book, authorization, claims)
        return reject_page(request, book, record, households, form,
                           {"reason": "Cần ghi lý do từ chối, từ 1 đến 200 ký tự."}, 400)
    return decide_row(request, claims, book_id, record_id, "REJECTED", reason, ("PENDING",))


# ---------- Summary, CSV, print ----------

def month_starts(count: int = 6) -> list[date]:
    first = today().replace(day=1)
    months = []
    for back in range(count - 1, -1, -1):
        total = first.year * 12 + first.month - 1 - back
        months.append(date(total // 12, total % 12 + 1, 1))
    return months


@app.get("/b/{book_id}/summary")
def summary(request: Request, book_id: UUID, claims: Claims = Depends(member)):
    with open_db() as conn:
        book, level = load_book(conn, claims, book_id)
        owner, htx = owner_of(claims, level), claims.htx_code
        months = month_starts()
        next_month = date(months[-1].year + months[-1].month // 12, months[-1].month % 12 + 1, 1)
        count, overall = store.sums(conn, htx, book, owner)
        _, this_month = store.sums(conn, htx, book, owner, since=months[-1], until=next_month)
        pending = store.count_records(conn, htx, book, owner, store.Filters(status="PENDING")) if book.approval else 0
        summed = [f for f in book.fields if f.summary]
        series = store.monthly(conn, htx, book, owner, summed[0].key if summed else None, months[0])
        choice = next((f for f in book.fields if f.type == "choice"), None)
        options = store.by_option(conn, htx, book, owner, choice.key) if choice else {}
    show = lambda f, v: fl.display(f, v, {})
    stats = [{"label": "Số dòng", "value": appkit.number(count, 0), "hint": "đã duyệt" if book.approval else "tất cả"}]
    if book.approval:
        stats.append({"label": "Chờ duyệt", "value": appkit.number(pending, 0), "hint": "dòng chưa được tính"})
    for f in summed:
        stats += [{"label": f"{f.label} tháng này", "value": show(f, this_month[f.key])},
                  {"label": f"{f.label} tất cả", "value": show(f, overall[f.key])}]
    if summed:
        f = summed[0]
        fmt = (lambda v: appkit.money(int(v))) if f.type == "money" else (lambda v: appkit.number(v, 3))
        month_chart = (f"{f.label} theo tháng (6 tháng gần nhất)", f.unit if f.type == "number" else "", fmt)
    else:
        month_chart = ("Số dòng theo tháng (6 tháng gần nhất)", "", lambda v: appkit.number(v, 0))
    month_rows = appkit.chart_rows([(f"{m.month:02d}/{m.year}", series.get(m, 0)) for m in months], month_chart[2])
    option_rows = (appkit.chart_rows([(o, options.get(o, 0)) for o in choice.options], lambda v: appkit.number(v, 0))
                   if choice else None)
    theme = theme_of(request)
    return page(request, "summary.html", book=book, stats=stats, month_title=month_chart[0], month_unit=month_chart[1],
                month_rows=month_rows, option_title=f"Số dòng theo {choice.label}" if choice else "",
                option_rows=option_rows, tabs=book_tabs(book, claims, theme), current="summary",
                can_write=can_write(claims, level) and book.status == "PUBLISHED")


def export_rows(request: Request, claims: Claims, book_id: UUID, authorization: str):
    """Book, caller's level, households by id and the rows (same filters and visibility as the list)."""
    with open_db() as conn:
        book, level = load_book(conn, claims, book_id)
    households, _ = book_households(book, authorization, claims)
    flt, params = read_filters(request, book)
    with open_db() as conn:
        records = store.list_records(conn, claims.htx_code, book, owner_of(claims, level), flt, store.MAX_EXPORT)
    return book, level, name_map(households, records), records, params


def csv_cell(f, value, names):
    if value is None or value == "":
        return ""
    if f.type in ("number", "money"):
        return Decimal(str(value)) if f.type == "number" else int(value)
    return fl.display(f, value, names)


@app.get("/b/{book_id}/export.csv")
def export_csv(request: Request, book_id: UUID, claims: Claims = Depends(member), authorization: str = Header()):
    book, level, names, records, _ = export_rows(request, claims, book_id, authorization)
    known = {f.key for f in book.fields}
    # A removed field leaves the design but not the data: its old values still go out, under its key.
    extra = sorted({k for r in records for k in r.data if k not in known}, key=lambda k: int(k[1:]) if k[1:].isdigit() else 0)
    header = [f.label for f in book.fields] + [f"(ô đã bỏ) {k}" for k in extra] + ["Người ghi", "Ngày ghi", "Tình trạng"]
    header = [h if not h.startswith("(ô đã bỏ)") else h.replace("(ô đã bỏ) ", "") for h in header]
    rows = [[csv_cell(f, r.data.get(f.key), names) for f in book.fields] + [str(r.data.get(k, "")) for k in extra]
            + [r.created_by_name, appkit.vn_datetime(r.created_at),
               RECORD_STATUS_NAMES[r.status] if book.approval else "Đã ghi"] for r in records]
    return appkit.csv_response(appkit.csv_filename("custom-books", claims.htx_code, book.name, today()), header, rows)


@app.get("/b/{book_id}/print")
def print_book(request: Request, book_id: UUID, claims: Claims = Depends(member), authorization: str = Header()):
    book, level, names, records, params = export_rows(request, claims, book_id, authorization)
    owner_role = "manager" if "manager" in claims.roles else "officer" if "officer" in claims.roles else "farmer"
    rows = [{"record": r, "cells": [fl.display(f, r.data.get(f.key), names) for f in book.fields]} for r in records]
    return page(request, "print.html", book=book, rows=rows, htx=claims.htx_code, printed=appkit.vn_date(today()),
                filtered=bool(params), back=appkit.shell_url(owner_role, "custom-books", f"/b/{book.id}"),
                statuses=RECORD_STATUS_NAMES)
