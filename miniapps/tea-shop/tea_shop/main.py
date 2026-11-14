# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Mini-app tea-shop: ban quản trị quản lý sản phẩm và đơn hàng, khách đặt hàng công khai (spec 2026-11-12 §5.2).

The gateway strips /apps/tea-shop, so routes are /, /products, /orders, /public/...; every link, form and redirect
writes the prefix back, because the browser goes through the web proxy and the gateway. Writes are POST + 303.
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

from tea_shop import appkit, store
from tea_shop.claims import Claims, read_claims

PREFIX = "/apps/tea-shop"
VN_TZ = timezone(timedelta(hours=7))  # Asia/Ho_Chi_Minh: UTC+7 with no DST since 1975, so no tzdata is needed
THEMES = ("light", "dark")  # the shell passes ?theme=; without it /dxos-app.css follows the system setting
HTX_RE = re.compile(r"[A-Za-z0-9_-]{1,20}")
LOT_RE = re.compile(r"[A-Za-z0-9-]{1,40}")
MAX_LINES = 100  # product lines one order form may carry
ERRORS = {401: "Cần đăng nhập để xem trang này.", 403: "Tài khoản của bạn không được vào trang này.",
          404: "Không có trang này.", 405: "Không có trang này.",
          503: "Hệ thống đang bận. Vui lòng thử lại sau ít phút."}
ORDER_STATUS = {"NEW": "Mới", "CONFIRMED": "Đã xác nhận", "SHIPPING": "Đang giao", "DONE": "Hoàn tất",
                "CANCELLED": "Đã huỷ"}
NOT_FOUND_ORDER = "Không tìm thấy đơn hàng với mã và số điện thoại này."
# Fixed keys only: ?notice= never carries free text into the page.
NOTICES = {"unchanged": "Không có gì thay đổi: đơn đã được xử lý trước đó.", "saved": "Đã lưu sản phẩm."}
DB_MAX_CONNECTIONS = 8  # the app role allows 10; leaves room for ./dxos install and an admin
DB_WAIT_S = 2
DB_SLOTS = threading.BoundedSemaphore(DB_MAX_CONNECTIONS)

log = logging.getLogger("tea_shop")
# The root path (PREFIX) is set on the server, `uvicorn --root-path /apps/tea-shop`: FastAPI deprecated its own.
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


def href(path: str, theme: str = "", **params) -> str:
    query = {**params, **({"theme": theme} if theme else {})}
    return f"{PREFIX}{path}" + (f"?{urlencode(query)}" if query else "")


STEP_LABELS = [ORDER_STATUS[key] for key in ("NEW", "CONFIRMED", "SHIPPING", "DONE")]
STEP_INDEX = {key: index for index, key in enumerate(("NEW", "CONFIRMED", "SHIPPING", "DONE"))}
PRODUCT_FILTERS = {"all": "Tất cả", "active": "Đang bán", "hidden": "Ngừng bán", "low": "Sắp hết hàng"}
NOTICES_HOME = {"saved": NOTICES["saved"]}


def tab_items(theme: str) -> list[tuple[str, str, str]]:
    return [("overview", "Tổng quan", href("/", theme)), ("orders", "Đơn hàng", href("/orders", theme)),
            ("products", "Sản phẩm", href("/products", theme))]


templates.env.globals.update(href=href, prefix=PREFIX, order_status=ORDER_STATUS, tab_items=tab_items,
                             step_labels=STEP_LABELS, step_index=STEP_INDEX, product_filters=PRODUCT_FILTERS)
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
    # Starlette re-raises after this response, so uvicorn still logs the traceback; the customer never sees it.
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


def parse_int(raw: str) -> int | None:
    raw = raw.strip()
    return int(raw) if raw.isascii() and raw.isdigit() and len(raw) <= 9 else None


@app.get("/healthz", response_class=PlainTextResponse)
def healthz():
    return "ok"


# ---------- Manager ----------

RECENT = 10  # rows of each list on the overview; the full lists are one link away


def manager_page(request, conn, claims, status=200, errors=(), form=None):
    htx = claims.htx_code
    figures = store.overview(conn, htx)
    daily = appkit.chart_rows([(day.strftime("%d/%m"), vnd) for day, vnd in figures.daily_revenue], appkit.money)
    return page(request, "manager.html", status, htx=htx, figures=figures, daily=daily,
                top=appkit.chart_rows(figures.top_products, lambda n: str(n)),
                orders=store.search_orders(conn, htx, size=RECENT)[0], products=store.search_products(conn, htx, size=RECENT)[0],
                notice=NOTICES_HOME.get(request.query_params.get("notice", "")), errors=errors,
                form=form or {"active": "on"})


@app.get("/")
def manager_home(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    return manager_page(request, conn, claims)


def product_form(name: str = Form(""), pack: str = Form(""), price_vnd: str = Form(""), stock: str = Form(""),
                 lot_code: str = Form(""), active: str = Form(""), stock_delta: str = Form("0")) -> dict:
    return {"name": name, "pack": pack, "price_vnd": price_vnd, "stock": stock, "lot_code": lot_code, "active": active,
            "stock_delta": stock_delta}


def parse_delta(raw: str) -> int | None:
    raw = raw.strip() or "0"
    return int(raw) if re.fullmatch(r"[+-]?[0-9]{1,4}", raw) else None


def read_product_form(form: dict, creating: bool) -> tuple[dict, list[str]]:
    """Validated values for store.create_product (absolute stock) / store.edit_product (stock_delta), and the errors."""
    errors = []
    name, pack, lot_code = form["name"].strip(), form["pack"].strip(), form["lot_code"].strip()
    if not 1 <= len(name) <= 120:
        errors.append("Tên sản phẩm cần từ 1 đến 120 ký tự.")
    if not 1 <= len(pack) <= 60:
        errors.append("Quy cách cần từ 1 đến 60 ký tự.")
    price = parse_int(form["price_vnd"])
    if price is None:
        errors.append("Giá phải là số đồng, không âm.")
    stock = parse_int(form["stock"]) if creating else parse_delta(form["stock_delta"])
    if stock is None:
        errors.append("Tồn kho phải là số nguyên, không âm." if creating else "Điều chỉnh tồn kho phải là số nguyên từ -9999 đến 9999.")
    if lot_code and not LOT_RE.fullmatch(lot_code):
        errors.append("Mã lô chỉ gồm chữ, số và dấu gạch ngang, tối đa 40 ký tự.")
    if errors:
        return {}, errors
    values = {"name": name, "pack": pack, "price_vnd": price, "lot_code": lot_code or None, "active": bool(form["active"])}
    return {**values, ("stock" if creating else "stock_delta"): stock}, []


@app.post("/products")
def create_product(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db),
                   form: dict = Depends(product_form)):
    values, errors = read_product_form(form, creating=True)
    if errors:
        return manager_page(request, conn, claims, 400, errors, form)
    store.create_product(conn, claims.htx_code, **values)
    return redirect(request, "/")


def edit_page(request, product, status=200, errors=(), form=None):
    form = form or {"name": product.name, "pack": product.pack, "price_vnd": str(product.price_vnd),
                    "stock_delta": "0", "lot_code": product.lot_code or "",
                    "active": "on" if product.active else ""}
    return page(request, "product_edit.html", status, product=product, errors=errors, form=form)


def existing_product(conn, htx_code: str, product_id: UUID) -> store.Product:
    product = store.get_product(conn, htx_code, product_id)
    if product is None:
        raise HTTPException(404)
    return product


@app.get("/products/{product_id}/edit")
def edit_product_form(request: Request, product_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    return edit_page(request, existing_product(conn, claims.htx_code, product_id))


@app.post("/products/{product_id}/edit")
def edit_product(request: Request, product_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db),
                 form: dict = Depends(product_form)):
    product = existing_product(conn, claims.htx_code, product_id)
    values, errors = read_product_form(form, creating=False)
    if errors:
        return edit_page(request, product, 400, errors, form)
    saved = store.edit_product(conn, claims.htx_code, product_id, **values)
    if saved is None:
        raise HTTPException(404)
    if isinstance(saved, store.Refusal):
        return edit_page(request, store.get_product(conn, claims.htx_code, product_id) or product, 400,
                         [saved.message], form)
    return redirect(request, "/", notice="saved")


def list_params(request: Request, names: tuple[str, ...]) -> dict[str, str]:
    """The query values a list page filters on, trimmed and cut to a sane length; unknown keys are never read."""
    return {name: request.query_params.get(name, "").strip()[:100] for name in names}


def list_href(path: str, theme: str, filters: dict[str, str], number: int | None = None) -> str:
    """The list URL with its non-empty filters (and a page when it is not the first), so links keep the filters."""
    query = {key: value for key, value in filters.items() if value}
    if number and number > 1:
        query["page"] = str(number)
    return href(path, theme, **query)


def order_filters(request: Request) -> dict[str, str]:
    values = list_params(request, ("q", "status", "from", "to"))
    values["status"] = values["status"] if values["status"] in store.ORDER_STATUSES else ""
    for key in ("from", "to"):
        values[key] = values[key] if appkit.parse_date(values[key]) else ""
    return values


def search_orders(conn, htx: str, filters: dict[str, str], page_raw: str | None, size: int | None):
    return store.search_orders(conn, htx, filters["status"] or "all", appkit.parse_date(filters["from"]),
                               appkit.parse_date(filters["to"]), filters["q"], page_raw, size)


def pager(path: str, theme: str, filters: dict[str, str], pg) -> dict:
    return {"prev_href": list_href(path, theme, filters, pg.number - 1) if pg.has_prev else None,
            "next_href": list_href(path, theme, filters, pg.number + 1) if pg.has_next else None}


@app.get("/orders")
def order_list(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    theme = request.query_params.get("theme", "")
    theme = theme if theme in THEMES else ""
    filters = order_filters(request)
    orders, pg = search_orders(conn, claims.htx_code, filters, request.query_params.get("page"), appkit.PAGE_SIZE)
    return page(request, "orders.html", htx=claims.htx_code, orders=orders, page=pg, filters=filters,
                export_href=list_href("/orders/export.csv", theme, filters), **pager("/orders", theme, filters, pg))


# Declared before /orders/{order_id}, whose UUID path would otherwise take "export.csv" for an id.
@app.get("/orders/export.csv")
def export_orders(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    orders, _ = search_orders(conn, claims.htx_code, order_filters(request), None, None)
    today = datetime.now(VN_TZ).date()
    return appkit.csv_response(
        appkit.csv_filename("tea-shop", claims.htx_code, "don-hang", today),
        ["Mã đơn", "Đặt lúc", "Khách", "Số điện thoại", "Địa chỉ", "Tổng tiền", "Trạng thái"],
        [(o.code, appkit.vn_datetime(o.created_at), o.customer_name, o.phone, o.address, o.total_vnd,
          ORDER_STATUS[o.status]) for o in orders])


@app.get("/orders/{order_id}/print")
def order_print(request: Request, order_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    found = store.get_order(conn, claims.htx_code, order_id)
    if found is None:
        raise HTTPException(404)
    order, items = found
    return page(request, "order_print.html", order=order, items=items, htx=claims.htx_code,
                back_href=appkit.shell_url("manager", "tea-shop", f"/orders/{order_id}"))


@app.get("/products")
def product_list(request: Request, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    theme = request.query_params.get("theme", "")
    theme = theme if theme in THEMES else ""
    filters = list_params(request, ("q", "show"))
    filters["show"] = filters["show"] if filters["show"] in PRODUCT_FILTERS and filters["show"] != "all" else ""
    products, pg = store.search_products(conn, claims.htx_code, filters["q"], filters["show"] or "all",
                                         request.query_params.get("page"), appkit.PAGE_SIZE)
    return page(request, "products.html", htx=claims.htx_code, products=products, page=pg, filters=filters,
                **pager("/products", theme, filters, pg))


@app.get("/orders/{order_id}")
def order_detail(request: Request, order_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    found = store.get_order(conn, claims.htx_code, order_id)
    if found is None:
        raise HTTPException(404)
    order, items = found
    return page(request, "order_detail.html", order=order, items=items,
                notice=NOTICES.get(request.query_params.get("notice", "")))


def move_order(request, moved: bool | None, order_id: UUID):
    if moved is None:
        raise HTTPException(404)
    return redirect(request, f"/orders/{order_id}", **({} if moved else {"notice": "unchanged"}))


@app.post("/orders/{order_id}/advance")
def advance_order(request: Request, order_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    return move_order(request, store.advance_order(conn, claims.htx_code, order_id), order_id)


@app.post("/orders/{order_id}/cancel")
def cancel_order(request: Request, order_id: UUID, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    return move_order(request, store.cancel_order(conn, claims.htx_code, order_id), order_id)


# ---------- Public (no token; never shows another customer's name, phone or address) ----------

def public_page(request, conn, htx, status=200, error=None, form=None):
    return page(request, "public.html", status, htx=htx, products=store.list_products(conn, htx, active_only=True),
                error=error, form=form or {})


@app.get("/public/{htx}")
def public_products(request: Request, htx: str = Depends(public_htx), conn=Depends(db)):
    return public_page(request, conn, htx)


def parse_lines(product_ids: list[str], quantities: list[str]) -> tuple[list[tuple[UUID, int]], bool]:
    """(product, quantity) pairs from the parallel form lists, and whether every quantity was a number 0-99."""
    lines, valid = [], True
    for raw_id, raw_quantity in list(zip(product_ids, quantities))[:MAX_LINES]:
        try:
            product_id = UUID(raw_id)
        except ValueError:
            product_id = UUID(int=0)  # matches no product, so the order is refused as "no longer sold"
        quantity = parse_int(raw_quantity) if raw_quantity.strip() else 0
        if quantity is None or quantity > 99:
            valid, quantity = False, 0
        lines.append((product_id, quantity))
    return lines, valid


@app.post("/public/{htx}/order")
def public_order(request: Request, htx: str = Depends(public_htx), conn=Depends(db),
                 product_id: list[str] = Form([]), quantity: list[str] = Form([]), customer_name: str = Form(""),
                 phone: str = Form(""), address: str = Form(""), note: str = Form("")):
    form = {"customer_name": customer_name, "phone": phone, "address": address, "note": note,
            "quantities": dict(zip(product_id, quantity))}
    customer_name, address, note = customer_name.strip(), address.strip(), note.strip()
    normalized = store.normalize_phone(phone)
    lines, quantities_valid = parse_lines(product_id, quantity)
    errors = []
    if not quantities_valid:
        errors.append("Số lượng mỗi sản phẩm phải từ 0 đến 99.")
    if not 1 <= len(customer_name) <= 80:
        errors.append("Họ tên cần từ 1 đến 80 ký tự.")
    if normalized is None:
        errors.append("Số điện thoại cần đúng 10 số, bắt đầu bằng 0 (hoặc +84).")
    if not 1 <= len(address) <= 200:
        errors.append("Địa chỉ cần từ 1 đến 200 ký tự.")
    if len(note) > 500:
        errors.append("Ghi chú tối đa 500 ký tự.")
    if errors:
        return public_page(request, conn, htx, 400, " ".join(errors), form)
    result = store.place_order(conn, htx, lines, customer_name, normalized, address, note or None)
    if isinstance(result, store.Refusal):
        empty = not any(q for _, q in lines)
        return public_page(request, conn, htx, 400 if empty else 409, result.message, form)
    return redirect(request, f"/public/{htx}/order", code=result.code, booked=1)


@app.get("/public/{htx}/order")
def public_track(request: Request, htx: str = Depends(public_htx), conn=Depends(db), code: str = "",
                 phone: str = "", booked: str = ""):
    code = code.strip().upper()[:16]
    found = None
    if code and phone:
        normalized = store.normalize_phone(phone)
        found = normalized and store.lookup(conn, htx, code, normalized)
        if not found:
            return page(request, "track.html", 404, htx=htx, code=code, error=NOT_FOUND_ORDER)
    return page(request, "track.html", htx=htx, code=code, booked=bool(booked and code and not phone), found=found)
