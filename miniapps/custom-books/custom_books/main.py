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
from pathlib import Path
from urllib.parse import urlencode
from uuid import UUID

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException

from custom_books import book_templates, core_client, fields as fl, store
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
                             access_levels=fl.ACCESS_LEVELS, icons=fl.ICONS, display=fl.display)


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
