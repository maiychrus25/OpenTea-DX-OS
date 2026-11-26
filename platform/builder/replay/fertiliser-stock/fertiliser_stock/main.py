# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Mini-app gen-fertiliser-stock: HTX ghi nhập, xuất phân bón và xem tồn kho theo loại.

The gateway strips /apps/gen-fertiliser-stock, so routes are /, /movements, /history; every link, form and redirect writes
the prefix back, because the browser goes through the web proxy and the gateway. Writes are POST + 303.
"""
import os
import re
import threading
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlencode

from fastapi import Depends, FastAPI, Form, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException

from fertiliser_stock import appkit, store

PREFIX = "/apps/gen-fertiliser-stock"
THEMES = ("light", "dark")  # the shell passes ?theme=; without it /dxos-app.css follows the system setting
ERRORS = {401: "Cần đăng nhập để xem trang này.", 403: "Tài khoản của bạn không được vào trang này.",
          404: "Không có trang này.", 405: "Không có trang này.",
          503: "Hệ thống đang bận. Vui lòng thử lại sau ít phút."}
NOTICES = {"saved": "Đã ghi."}  # fixed keys only: ?notice= never carries free text into the page
QUANTITY_RE = re.compile(r"[0-9]{1,6}(?:[.,][0-9])?")
MAX_QUANTITY = Decimal(100000)
PAGE_SIZE = 20
DB_SLOTS = threading.BoundedSemaphore(8)  # the app role allows 10 connections; leaves room for ./dxos install

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


def href(path: str, theme: str = "", **params) -> str:
    query = {**params, **({"theme": theme} if theme else {})}
    return f"{PREFIX}{path}" + (f"?{urlencode(query)}" if query else "")


templates.env.globals.update(href=href, prefix=PREFIX)
templates.env.filters["kg"] = lambda q: appkit.number(q, 1) + " kg"
templates.env.filters["vn_time"] = appkit.vn_datetime
TABS = (("stock", "Tồn kho", "/"), ("history", "Lịch sử", "/history"))


def theme_of(request: Request) -> str:
    theme = request.query_params.get("theme", "")
    return theme if theme in THEMES else ""


def page(request: Request, name: str, status: int = 200, **context) -> HTMLResponse:
    theme = theme_of(request)
    tabs = [(key, label, href(path, theme)) for key, label, path in TABS]
    return templates.TemplateResponse(request, name, {"theme": theme, "tabs": tabs, **context}, status_code=status)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return page(request, "message.html", exc.status_code, message=ERRORS.get(exc.status_code, "Có lỗi xảy ra."))


@app.exception_handler(RequestValidationError)
async def bad_request(request: Request, exc: RequestValidationError):
    return page(request, "message.html", 400, message="Dữ liệu gửi lên chưa đúng.")


@app.exception_handler(Exception)
async def server_error(request: Request, exc: Exception):
    # Starlette re-raises after this response, so uvicorn still logs the traceback; the user never sees it.
    return page(request, "message.html", 500, message="Có lỗi xảy ra. Vui lòng thử lại sau.")


def staff(request: Request) -> appkit.Claims:
    """The gateway already checks the role per prefix; this keeps the app safe if a route is ever widened."""
    claims = appkit.read_claims(request.headers.get("authorization"), request.headers)
    if claims is None:
        raise HTTPException(401)
    if not claims.htx_code or not ({"manager", "officer"} & set(claims.roles)):
        raise HTTPException(403)
    return claims


@contextmanager
def open_db():
    if not DB_SLOTS.acquire(timeout=2):
        raise HTTPException(503)
    try:
        with store.connect(os.environ["DXOS_APP_DB_URL"]) as conn:
            yield conn
    finally:
        DB_SLOTS.release()


def db():
    with open_db() as conn:
        yield conn


def parse_quantity(raw: str) -> Decimal | None:
    raw = raw.strip()
    if not QUANTITY_RE.fullmatch(raw):
        return None
    quantity = Decimal(raw.replace(",", "."))
    return quantity if 0 < quantity <= MAX_QUANTITY else None


@app.get("/healthz", response_class=PlainTextResponse)
def healthz():
    return "ok"


@app.get("/", response_class=HTMLResponse)
def stock_page(request: Request, claims: appkit.Claims = Depends(staff), conn=Depends(db)):
    lines = store.stock(conn, claims.htx_code)
    return page(request, "stock.html", lines=lines, notice=NOTICES.get(request.query_params.get("notice", "")),
                total_kg=sum((line.stock_kg for line in lines), Decimal(0)), error=None, typed={})


@app.post("/movements", response_class=HTMLResponse)
def add_movement(request: Request, product: str = Form(""), kind: str = Form(""), quantity: str = Form(""),
                 note: str = Form(""), claims: appkit.Claims = Depends(staff), conn=Depends(db)):
    product, note = product.strip(), note.strip()
    typed = {"product": product, "kind": kind, "quantity": quantity, "note": note}
    amount = parse_quantity(quantity)
    error = None
    if not 1 <= len(product) <= 80:
        error = "Tên loại phân phải từ 1 đến 80 ký tự."
    elif kind not in ("in", "out"):
        error = "Hãy chọn nhập hoặc xuất."
    elif amount is None:
        error = "Số lượng phải lớn hơn 0 và tối đa 100.000 kg, một chữ số thập phân (ví dụ 12,5)."
    elif len(note) > 200:
        error = "Ghi chú tối đa 200 ký tự."
    elif kind == "out" and amount > store.stock_of(conn, claims.htx_code, product):
        error = "Số xuất lớn hơn số đang tồn kho của loại này."
    if error:
        lines = store.stock(conn, claims.htx_code)
        return page(request, "stock.html", 422, lines=lines, notice=None, error=error, typed=typed,
                    total_kg=sum((line.stock_kg for line in lines), Decimal(0)))
    store.add_movement(conn, claims.htx_code, product, kind, amount, note, claims.sub)
    return RedirectResponse(href("/", theme_of(request), notice="saved"), status_code=303)


@app.get("/history", response_class=HTMLResponse)
def history(request: Request, claims: appkit.Claims = Depends(staff), conn=Depends(db)):
    paging = appkit.page_of(request.query_params.get("page"), store.count_movements(conn, claims.htx_code), PAGE_SIZE)
    rows = store.list_movements(conn, claims.htx_code, paging.size, paging.offset)
    theme = theme_of(request)
    prev_href = href("/history", theme, page=paging.number - 1) if paging.has_prev else None
    next_href = href("/history", theme, page=paging.number + 1) if paging.has_next else None
    return page(request, "history.html", rows=rows, paging=paging, prev_href=prev_href, next_href=next_href)
