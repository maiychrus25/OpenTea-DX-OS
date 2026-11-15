# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Cooperative settings (spec 3, 7.3 and 8). A cooperative with no row gets the defaults."""
import re
import unicodedata
from dataclasses import dataclass, fields
from uuid import UUID

from psycopg.rows import class_row

from tea_tour.domain import vietqr


@dataclass(frozen=True)
class Settings:
    htx_code: str
    display_name: str = ""
    tagline: str = ""
    intro: str = ""
    hotline: str = ""
    zalo: str = ""
    email: str = ""
    address: str = ""
    map_url: str = ""
    cover_media_id: UUID | None = None
    bank_bin: str = ""
    bank_account: str = ""
    bank_holder: str = ""
    deposit_percent: int = 0
    hold_hours: int = 24
    cancel_free_hours: int = 24
    auto_confirm: bool = False
    policy_text: str = ""

    @property
    def bank_ready(self) -> bool:
        """True when a VietQR can be drawn: bank, account and holder are all set."""
        return bool(self.bank_bin and self.bank_account and self.bank_holder)

    @property
    def bank_name(self) -> str:
        bank = vietqr.bank_by_bin(self.bank_bin)
        return bank.name if bank else ""


COLUMNS = ", ".join(f.name for f in fields(Settings))
TEXT_LIMITS = {"display_name": 80, "tagline": 160, "intro": 2000, "address": 200, "policy_text": 2000}
LABELS = {"display_name": "Tên hiển thị", "tagline": "Lời giới thiệu ngắn", "intro": "Lời giới thiệu",
          "address": "Địa chỉ", "policy_text": "Chính sách"}
BANK_FIELDS = ("bank_bin", "bank_account", "bank_holder")


def get(conn, htx_code: str) -> Settings:
    with conn.cursor(row_factory=class_row(Settings)) as cur:
        row = cur.execute(f"SELECT {COLUMNS} FROM settings WHERE htx_code = %s", (htx_code,)).fetchone()
    return row or Settings(htx_code=htx_code)


def _int(raw, low: int, high: int) -> int | None:
    raw = str(raw).strip()
    return int(raw) if raw.isascii() and raw.isdigit() and len(raw) <= 6 and low <= int(raw) <= high else None


def _upper_ascii(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text.replace("đ", "d").replace("Đ", "D")).encode("ascii", "ignore").decode()
    return re.sub(r" +", " ", folded.upper()).strip()


def clean(form: dict) -> tuple[dict, dict[str, str]]:
    """Validated column values from raw form strings, and {field: Vietnamese error}. Missing keys keep their default."""
    values: dict = {}
    errors: dict[str, str] = {}
    for name, limit in TEXT_LIMITS.items():
        text = str(form.get(name, "")).strip()
        if len(text) > limit:
            errors[name] = f"{LABELS[name]} tối đa {limit} ký tự."
        values[name] = text
    hotline = re.sub(r"\s+", " ", str(form.get("hotline", "")).strip())
    if hotline and not re.fullmatch(r"\+?[0-9][0-9 .\-]{5,18}", hotline):
        errors["hotline"] = "Đường dây nóng chỉ gồm chữ số, dấu cách, dấu chấm hoặc gạch ngang (6 đến 20 ký tự)."
    values["hotline"] = hotline
    zalo = str(form.get("zalo", "")).strip()
    if zalo and not re.fullmatch(r"\+?[0-9][0-9 .\-]{5,28}", zalo):
        errors["zalo"] = "Số Zalo chỉ gồm chữ số, dấu cách, dấu chấm hoặc gạch ngang."
    values["zalo"] = zalo
    email = str(form.get("email", "")).strip()
    if email and not (len(email) <= 120 and re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)):
        errors["email"] = "Email không hợp lệ (tối đa 120 ký tự)."
    values["email"] = email
    map_url = str(form.get("map_url", "")).strip()
    if map_url and not (map_url.startswith("https://") and len(map_url) <= 300 and not re.search(r"\s", map_url)):
        errors["map_url"] = "Liên kết bản đồ phải bắt đầu bằng https:// và tối đa 300 ký tự."
    values["map_url"] = map_url
    bank_bin = str(form.get("bank_bin", "")).strip()
    if bank_bin and vietqr.bank_by_bin(bank_bin) is None:
        errors["bank_bin"] = "Hãy chọn ngân hàng trong danh sách."
    account = re.sub(r"[ .\-]", "", str(form.get("bank_account", "")))
    if account and not re.fullmatch(r"[0-9]{6,19}", account):
        errors["bank_account"] = "Số tài khoản gồm 6 đến 19 chữ số."
    holder = _upper_ascii(str(form.get("bank_holder", "")))  # the banking apps compare the holder name in upper-case ASCII
    if holder and not re.fullmatch(r"[A-Z0-9 ]{1,60}", holder):
        errors["bank_holder"] = "Tên chủ tài khoản chỉ gồm chữ không dấu, số và dấu cách, tối đa 60 ký tự."
    values.update(bank_bin=bank_bin, bank_account=account, bank_holder=holder)
    filled = [name for name in BANK_FIELDS if values[name]]
    if filled and len(filled) < 3:
        for name in BANK_FIELDS:
            if not values[name]:
                errors.setdefault(name, "Cần khai đủ ngân hàng, số tài khoản và tên chủ tài khoản.")
    for name, low, high, label in (("deposit_percent", 0, 100, "Tỉ lệ đặt cọc từ 0 đến 100 (%)."),
                                   ("hold_hours", 1, 168, "Số giờ giữ chỗ từ 1 đến 168."),
                                   ("cancel_free_hours", 0, 720, "Hạn huỷ miễn phí từ 0 đến 720 giờ.")):
        number = _int(form.get(name, ""), low, high)
        if number is None:
            errors[name] = label
        values[name] = number
    values["auto_confirm"] = str(form.get("auto_confirm", "")).lower() in ("on", "1", "true", "yes")
    return values, errors


def save(conn, htx_code: str, form: dict) -> dict[str, str]:
    """Validate and upsert every field except the cover image. Returns the errors; empty means saved."""
    values, errors = clean(form)
    if errors:
        return errors
    names = list(values)
    conn.execute(
        f"INSERT INTO settings (htx_code, {', '.join(names)}) VALUES (%s, {', '.join(['%s'] * len(names))}) "
        f"ON CONFLICT (htx_code) DO UPDATE SET " + ", ".join(f"{n} = EXCLUDED.{n}" for n in names),
        [htx_code, *values.values()])
    return {}
