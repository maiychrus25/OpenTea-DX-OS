# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Ô của sổ: kiểm thiết kế, kiểm giá trị theo kiểu, hiển thị. No SQL here: labels are plain text for ever."""
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Mapping, Sequence

from custom_books import appkit

FIELD_TYPES = ("text", "long_text", "number", "money", "date", "choice", "yes_no", "household")
ACCESS_LEVELS = ("none", "view", "own", "all")
MAX_FIELDS, MAX_LIST, MAX_BOOKS, MAX_OPTIONS = 20, 6, 50, 20
ICONS = ("leaf", "scale", "shopping-bag", "package", "map-pinned", "users", "calendar", "clipboard-list", "truck",
         "sparkles")
KEY_RE = re.compile(r"f[0-9]{1,4}")
MAX_KEY = 9999
MAX_ROWS = 60  # posted rows; far above MAX_FIELDS + blanks, so a hostile form cannot make the parser loop long
TEXT_MAX, LONG_TEXT_MAX = 200, 2000
_ROW_INPUT = re.compile(r"(key|label|type|options|unit|required|in_list|summary|order|remove)_([0-9]{1,3})")
_NUMBER = re.compile(r"[0-9]{1,12}([.,][0-9]{1,3})?")
_MONEY = re.compile(r"[0-9]{1,12}|[0-9]{1,3}(\.[0-9]{3}){1,3}")
SUMMABLE = ("number", "money")


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    type: str
    required: bool = False
    in_list: bool = False
    summary: bool = False
    options: tuple[str, ...] = ()
    unit: str = ""

    def to_json(self) -> dict:
        return {"key": self.key, "label": self.label, "type": self.type, "required": self.required,
                "in_list": self.in_list, "summary": self.summary, "options": list(self.options), "unit": self.unit}

    @staticmethod
    def from_json(raw: dict) -> "Field":
        return Field(key=raw["key"], label=raw["label"], type=raw["type"], required=bool(raw.get("required")),
                     in_list=bool(raw.get("in_list")), summary=bool(raw.get("summary")),
                     options=tuple(raw.get("options") or ()), unit=raw.get("unit") or "")


def level_for(roles: Sequence[str], officer_access: str, farmer_access: str) -> str:
    """The caller's access level on a book: the manager always has everything; else the best level of their roles."""
    if "manager" in roles:
        return "all"
    levels = [lv for role, lv in (("officer", officer_access), ("farmer", farmer_access)) if role in roles]
    return max(levels, key=ACCESS_LEVELS.index, default="none")


# ---------- the design form ----------

def form_rows(form: Mapping[str, str]) -> list[dict]:
    """The posted rows as plain dicts (raw text), in the order of their numbers; used to parse and to show again."""
    numbers = sorted({int(m.group(2)) for name in form if (m := _ROW_INPUT.fullmatch(name))})[:MAX_ROWS]
    rows = []
    for i in numbers:
        rows.append({"i": i, "key": form.get(f"key_{i}", "").strip(), "label": form.get(f"label_{i}", ""),
                     "type": form.get(f"type_{i}", "text"), "options": form.get(f"options_{i}", ""),
                     "unit": form.get(f"unit_{i}", ""), "required": f"required_{i}" in form,
                     "in_list": f"in_list_{i}" in form, "summary": f"summary_{i}" in form,
                     "order": form.get(f"order_{i}", ""), "remove": f"remove_{i}" in form})
    return rows


def rows_of(fields: Sequence[Field], blanks: int = 3) -> list[dict]:
    """Rows to show for a saved design: one per field and a few empty ones to add fields."""
    rows = [{"i": n, "key": f.key, "label": f.label, "type": f.type, "options": "; ".join(f.options), "unit": f.unit,
             "required": f.required, "in_list": f.in_list, "summary": f.summary, "order": str(n * 10),
             "remove": False} for n, f in enumerate(fields, 1)]
    start = len(rows)
    return rows + [{"i": start + n, "key": "", "label": "", "type": "text", "options": "", "unit": "", "required": False,
                    "in_list": False, "summary": False, "order": "", "remove": False} for n in range(1, blanks + 1)]


def split_options(raw: str) -> tuple[str, ...]:
    """Options typed on one line, separated by ';'. Text with line breaks is read one option per line (older forms),
    so a ';' left inside such a line is returned as it is and refused by the caller."""
    parts = raw.splitlines() if "\n" in raw or "\r" in raw else raw.split(";")
    return tuple(p.strip() for p in parts if p.strip())


def parse_design(form: Mapping[str, str], existing: Sequence[Field], next_key: int,
                 has_records: bool) -> tuple[list[Field], int, dict[str, str]]:
    """The fields after the form, the next unused key, and the errors by input name ("fields" for the whole list).

    A key is never handed out twice: next_key only grows, even when a field is removed. A removed field leaves the
    design but its values stay in the records. Once the book has records a field keeps its type."""
    known = {f.key: f for f in existing}
    errors: dict[str, str] = {}
    kept: list[tuple[int, int, Field]] = []  # (order, position, field)
    seen_keys: set[str] = set()
    seen_labels: set[str] = set()
    rows = form_rows(form)
    for position, row in enumerate(rows):
        i, key = row["i"], row["key"]
        old = known.get(key) if key else None
        if key and old is None:
            errors[f"label_{i}"] = "Ô này không có trong sổ. Hãy tải lại trang."
            continue
        if key in seen_keys:
            errors[f"label_{i}"] = "Ô này bị gửi hai lần. Hãy tải lại trang."
            continue
        if old is not None:
            seen_keys.add(key)
        if row["remove"] or (old is None and not row["label"].strip()):
            continue  # removed, or an empty row left blank
        label = row["label"].strip()
        if not 1 <= len(label) <= 60:
            errors[f"label_{i}"] = "Tên ô cần từ 1 đến 60 ký tự."
        elif label.casefold() in seen_labels:
            errors[f"label_{i}"] = "Hai ô không được trùng tên."
        seen_labels.add(label.casefold())
        ftype = row["type"]
        if ftype not in FIELD_TYPES:
            errors[f"type_{i}"] = "Chọn một kiểu ô trong danh sách."
            ftype = old.type if old else "text"
        elif old is not None and has_records and ftype != old.type:
            errors[f"type_{i}"] = "Ô này đã có dữ liệu nên không đổi được kiểu."
            ftype = old.type
        options: tuple[str, ...] = ()
        if ftype == "choice":
            options = split_options(row["options"])
            if any(";" in o for o in options):
                errors[f"options_{i}"] = "Một lựa chọn không được chứa dấu chấm phẩy; dấu này dùng để ngăn cách các lựa chọn."
            elif not 2 <= len(options) <= MAX_OPTIONS or any(len(o) > 60 for o in options):
                errors[f"options_{i}"] = (f"Cần từ 2 đến {MAX_OPTIONS} lựa chọn, cách nhau bằng dấu chấm phẩy, "
                                          "mỗi lựa chọn tối đa 60 ký tự.")
            elif len(set(o.casefold() for o in options)) != len(options):
                errors[f"options_{i}"] = "Các lựa chọn không được trùng nhau."
            elif old is not None and has_records and not set(old.options) <= set(options):
                errors[f"options_{i}"] = "Ô này đã có dữ liệu nên không bỏ được lựa chọn cũ."
        unit = row["unit"].strip() if ftype == "number" else ""
        if len(unit) > 20:
            errors[f"unit_{i}"] = "Đơn vị tối đa 20 ký tự."
        if old is None:
            if next_key > MAX_KEY:
                errors["fields"] = "Sổ này đã dùng hết mã ô. Hãy tạo sổ mới."
                continue
            key, next_key = f"f{next_key}", next_key + 1
        order = appkit.parse_int(row["order"].strip(), 0, 9999)
        field = Field(key=key, label=label, type=ftype, required=row["required"] and ftype != "yes_no",
                      in_list=row["in_list"], summary=row["summary"] and ftype in SUMMABLE, options=options, unit=unit)
        kept.append((order if order is not None else 10_000 + position, position, field))
    # A field that the form did not mention at all stays (an old page must not delete data by omission).
    mentioned = {r["key"] for r in rows}
    for position, old in enumerate(existing):
        if old.key not in mentioned:
            kept.append((10_000 + position, position, old))
    fields = [f for _, _, f in sorted(kept, key=lambda t: (t[0], t[1]))]
    if len(fields) > MAX_FIELDS:
        errors["fields"] = f"Một sổ có tối đa {MAX_FIELDS} ô."
    elif sum(f.in_list for f in fields) > MAX_LIST:
        errors["fields"] = f"Chỉ tối đa {MAX_LIST} ô được hiện trong danh sách."
    return fields, next_key, errors


def parse_settings(form: Mapping[str, str]) -> tuple[dict, dict[str, str]]:
    """Name, description, icon, the two access levels and approval, with the errors by input name."""
    errors: dict[str, str] = {}
    name, description = form.get("name", "").strip(), form.get("description", "").strip()
    if not 1 <= len(name) <= 80:
        errors["name"] = "Tên sổ cần từ 1 đến 80 ký tự."
    if len(description) > 200:
        errors["description"] = "Mô tả tối đa 200 ký tự."
    icon = form.get("icon", "")
    if icon not in ICONS:
        errors["icon"] = "Chọn một biểu tượng trong danh sách."
    levels = {}
    for role in ("officer_access", "farmer_access"):
        levels[role] = form.get(role, "")
        if levels[role] not in ACCESS_LEVELS:
            errors[role] = "Chọn một mức trong danh sách."
    return {"name": name, "description": description, "icon": icon, "approval": "approval" in form, **levels}, errors


# ---------- the entry form ----------

def parse_values(fields: Sequence[Field], form: Mapping[str, str],
                 households: Mapping[str, str] | None) -> tuple[dict, dict[str, str]]:
    """Stored values by field key (empty optional values are left out) and the errors by field key.

    households: id -> name of the households the caller may use, or None when the core could not be reached."""
    values: dict = {}
    errors: dict[str, str] = {}
    for f in fields:
        raw = form.get(f.key, "")
        text = raw.strip() if isinstance(raw, str) else ""
        if f.type == "yes_no":
            values[f.key] = f.key in form and text not in ("", "0", "false")
            continue
        if not text:
            if f.required:
                errors[f.key] = "Ô này bắt buộc."
            continue
        if f.type == "text":
            ok, value = len(text) <= TEXT_MAX, text
            msg = f"Tối đa {TEXT_MAX} ký tự."
        elif f.type == "long_text":
            ok, value = len(text) <= LONG_TEXT_MAX, text
            msg = f"Tối đa {LONG_TEXT_MAX} ký tự."
        elif f.type == "number":
            ok = bool(_NUMBER.fullmatch(text))
            value = text.replace(",", ".") if ok else None
            if ok:
                value = format(Decimal(value).normalize(), "f")
            msg = "Nhập số không âm, tối đa 3 chữ số sau dấu phẩy, ví dụ 12,5."
        elif f.type == "money":
            ok = bool(_MONEY.fullmatch(text))
            value = int(text.replace(".", "")) if ok else None
            msg = "Nhập số đồng, ví dụ 150000 hoặc 150.000."
        elif f.type == "date":
            day = appkit.parse_date(text)
            ok, value, msg = day is not None, day.isoformat() if day else None, "Nhập ngày hợp lệ."
        elif f.type == "choice":
            ok, value, msg = text in f.options, text, "Chọn một mục trong danh sách."
        else:  # household
            if households is None:
                ok, value, msg = False, None, "Không lấy được danh sách nông hộ. Vui lòng thử lại sau ít phút."
            else:
                ok, value, msg = text in households, text, "Chọn một nông hộ trong danh sách."
        if ok:
            values[f.key] = value
        else:
            errors[f.key] = msg
    return values, errors


def display(field: Field, value, households: Mapping[str, str]) -> str:
    """Text for a stored value; anything odd is shown as it is, never raising."""
    if value is None or value == "":
        return ""
    try:
        if field.type == "number":
            text = appkit.number(Decimal(str(value)), 3)
            return f"{text} {field.unit}" if field.unit else text
        if field.type == "money":
            return appkit.money(int(value))
        if field.type == "date":
            return appkit.vn_date(date.fromisoformat(str(value)))
        if field.type == "yes_no":
            return "Có" if value is True else "Không"
        if field.type == "household":
            return households.get(str(value), "Nông hộ khác")
    except (ValueError, ArithmeticError, TypeError):
        return str(value)
    return str(value)
