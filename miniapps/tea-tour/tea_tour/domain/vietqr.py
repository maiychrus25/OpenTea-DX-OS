# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""VietQR / NAPAS (EMVCo) payload for a bank transfer, spec Appendix A."""
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Bank:
    bin: str
    name: str


BANKS: tuple[Bank, ...] = tuple(Bank(b, n) for n, b in (
    ("Agribank", "970405"), ("Co-opBank", "970446"), ("BIDV", "970418"), ("VietinBank", "970415"),
    ("Vietcombank", "970436"), ("MB", "970422"), ("Techcombank", "970407"), ("ACB", "970416"),
    ("VPBank", "970432"), ("TPBank", "970423"), ("Sacombank", "970403"), ("HDBank", "970437"),
    ("VIB", "970441"), ("SHB", "970443"), ("LPBank", "970449"), ("Eximbank", "970431"), ("MSB", "970426"),
    ("OCB", "970448"), ("SeABank", "970440"), ("Nam A Bank", "970428"), ("Bac A Bank", "970409")))
CONTENT_MAX = 25  # the transfer note field is short on most banking apps


def bank_by_bin(bank_bin: str) -> Bank | None:
    return next((bank for bank in BANKS if bank.bin == bank_bin), None)


def _field(tag: str, value: str) -> str:
    return f"{tag}{len(value):02d}{value}"


def crc16(text: str) -> str:
    """CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) as 4 upper-case hex digits."""
    crc = 0xFFFF
    for byte in text.encode("ascii"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return f"{crc:04X}"


def payload(bank_bin: str, account: str, amount_vnd: int, content: str) -> str:
    if not re.fullmatch(r"[0-9]{6}", bank_bin):
        raise ValueError("BIN phải đủ 6 chữ số")
    if not re.fullmatch(r"[0-9]{6,19}", account):
        raise ValueError("Số tài khoản phải từ 6 đến 19 chữ số")
    if amount_vnd <= 0:
        raise ValueError("Số tiền phải lớn hơn 0")
    if not content.isascii() or not content.isprintable() or not 1 <= len(content) <= CONTENT_MAX:
        raise ValueError("Nội dung chuyển khoản phải là chữ ASCII, tối đa %d ký tự" % CONTENT_MAX)
    beneficiary = _field("00", bank_bin) + _field("01", account)
    merchant = _field("00", "A000000727") + _field("01", beneficiary) + _field("02", "QRIBFTTA")
    body = (_field("00", "01") + _field("01", "12") + _field("38", merchant) + _field("53", "704")
            + _field("54", str(amount_vnd)) + _field("58", "VN") + _field("62", _field("08", content)) + "6304")
    return body + crc16(body)
