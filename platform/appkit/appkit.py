# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Copied by make appkit-sync from platform/appkit/appkit.py. Edit the original.
"""Python helpers shared by the mini-apps: paging, safe query parameters, Vietnamese formats, CSV, chart widths."""
import csv
import io
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Sequence
from zoneinfo import ZoneInfo

from starlette.responses import Response

PAGE_SIZE = 25
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_INT = re.compile(r"-?[0-9]+")


@dataclass(frozen=True)
class Page:
    number: int
    size: int
    total: int

    @property
    def pages(self) -> int:
        return max(1, -(-self.total // self.size))

    @property
    def offset(self) -> int:
        return (self.number - 1) * self.size

    @property
    def has_prev(self) -> bool:
        return self.number > 1

    @property
    def has_next(self) -> bool:
        return self.number < self.pages


def parse_int(raw: str | None, low: int, high: int) -> int | None:
    """An integer in [low, high], or None for anything else (missing, text, out of range)."""
    if raw is None or not _INT.fullmatch(raw):
        return None
    value = int(raw)
    return value if low <= value <= high else None


def page_of(raw: str | None, total: int, size: int = PAGE_SIZE) -> Page:
    """A page that always exists: missing or invalid -> 1, beyond the end -> the last page."""
    last = max(1, -(-total // size))
    number = parse_int(raw, 1, 10**9) or 1
    return Page(min(number, last), size, total)


def parse_date(raw: str | None) -> date | None:
    """Exactly YYYY-MM-DD (ASCII digits) and a real calendar day, else None."""
    if raw is None or not _DATE.fullmatch(raw):
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def like_pattern(q: str) -> str:
    """For `ILIKE %s ESCAPE '\\'`: the text is matched literally, never as wildcards."""
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _group(digits: str) -> str:
    return f"{int(digits):,}".replace(",", ".")


def money(vnd: int) -> str:
    return f"{_group(str(abs(vnd)))} ₫" if vnd >= 0 else f"-{_group(str(-vnd))} ₫"


def number(value, digits: int = 1) -> str:
    """12.50 -> '12,5'; 8 -> '8': dot for thousands, comma for decimals, no trailing zeros."""
    exact = Decimal(value).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)
    whole, _, frac = f"{abs(exact):f}".partition(".")
    text = _group(whole) + ("," + frac.rstrip("0") if frac.rstrip("0") else "")
    return "-" + text if exact < 0 else text


def vn_date(value: date | datetime) -> str:
    if isinstance(value, datetime) and value.tzinfo:
        value = value.astimezone(VN_TZ)
    return value.strftime("%d/%m/%Y")


def vn_datetime(value: datetime) -> str:
    return value.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M")


@dataclass(frozen=True)
class ChartRow:
    label: str
    value: str
    percent: int


def chart_rows(pairs: Sequence[tuple[str, Decimal | int]], fmt=number) -> list[ChartRow]:
    """Bar widths as a percent of the largest value; all zero -> 0 for every row."""
    top = max((v for _, v in pairs), default=0)
    return [ChartRow(label, fmt(v), round(v * 100 / top) if top > 0 and v > 0 else 0) for label, v in pairs]


def csv_filename(app_id: str, htx_code: str, name: str, day: date) -> str:
    def slug(text: str) -> str:
        ascii_text = unicodedata.normalize("NFKD", text.replace("đ", "d").replace("Đ", "D")).encode("ascii", "ignore").decode()
        return re.sub(r"[^A-Za-z0-9]+", "-", ascii_text).strip("-") or "x"

    return f"{slug(app_id)}-{slug(htx_code)}-{slug(name)}-{day.isoformat()}.csv"


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
        return str(value)
    text = str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


def csv_response(filename: str, header: Sequence[str], rows: Iterable[Sequence]) -> Response:
    """UTF-8 with BOM (Excel reads Vietnamese), CRLF, a download; text cells that look like formulas get a leading '."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow([_cell(h) for h in header])
    for row in rows:
        writer.writerow([_cell(c) for c in row])
    return Response(
        ("﻿" + out.getvalue()).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"content-disposition": f'attachment; filename="{filename}"'},
    )


def shell_url(role: str, app_id: str, path: str = "/") -> str:
    """The web page that frames the app, for a link back out of a print page: /manager/apps/tea-shop/orders."""
    return f"/{role}/apps/{app_id}{path}"
