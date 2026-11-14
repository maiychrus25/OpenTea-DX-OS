# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Tám mẫu sổ có sẵn (spec §4.4) và sổ trắng. A template is only a starting design: the manager edits it before publishing."""
from dataclasses import dataclass

from custom_books.fields import Field


@dataclass(frozen=True)
class BookTemplate:
    key: str
    name: str
    description: str
    icon: str
    officer_access: str
    farmer_access: str
    approval: bool
    fields: tuple[Field, ...]

    @property
    def next_key(self) -> int:
        return len(self.fields) + 1


def _f(n: int, label: str, type: str, *, required=False, in_list=False, summary=False, options=(), unit="") -> Field:
    return Field(f"f{n}", label, type, required, in_list, summary, tuple(options), unit)


TEMPLATES: dict[str, BookTemplate] = {t.key: t for t in (
    BookTemplate("picking", "Chấm công hái chè", "Ghi số ký chè mỗi nông hộ hái trong ngày.", "leaf", "all", "own", True, (
        _f(1, "Ngày", "date", required=True, in_list=True),
        _f(2, "Nông hộ", "household", required=True, in_list=True),
        _f(3, "Số ký hái", "number", required=True, in_list=True, summary=True, unit="kg"),
        _f(4, "Loại chè", "choice", in_list=True, options=("Chè búp tươi", "Một tôm hai lá", "Chè già")),
        _f(5, "Ghi chú", "long_text"))),
    BookTemplate("spraying", "Sổ phun thuốc bảo vệ thực vật", "Ghi lần phun thuốc: thuốc nào, liều nào, khi nào được thu hái.",
                 "sparkles", "all", "own", False, (
        _f(1, "Ngày phun", "date", required=True, in_list=True),
        _f(2, "Lô chè", "text", required=True, in_list=True),
        _f(3, "Tên thuốc", "text", required=True, in_list=True),
        _f(4, "Liều lượng", "text", in_list=True),
        _f(5, "Diện tích phun", "number", summary=True, unit="sào"),
        _f(6, "Ngày được thu hái lại", "date", in_list=True),
        _f(7, "Người phun", "text"))),
    BookTemplate("fertilising", "Sổ bón phân", "Ghi lần bón phân cho từng lô chè.", "package", "all", "own", False, (
        _f(1, "Ngày bón", "date", required=True, in_list=True),
        _f(2, "Lô chè", "text", required=True, in_list=True),
        _f(3, "Loại phân", "choice", required=True, in_list=True,
           options=("Phân hữu cơ", "NPK", "Đạm", "Lân", "Kali")),
        _f(4, "Lượng phân", "number", required=True, in_list=True, summary=True, unit="kg"),
        _f(5, "Chi phí", "money", in_list=True, summary=True),
        _f(6, "Ghi chú", "long_text"))),
    BookTemplate("cashbook", "Sổ thu chi", "Ghi các khoản thu và chi của HTX; trưởng HTX duyệt từng khoản.", "scale",
                 "own", "none", True, (
        _f(1, "Ngày", "date", required=True, in_list=True),
        _f(2, "Loại", "choice", required=True, in_list=True, options=("Thu", "Chi")),
        _f(3, "Nội dung", "text", required=True, in_list=True),
        _f(4, "Số tiền", "money", required=True, in_list=True, summary=True),
        _f(5, "Người nộp hoặc nhận", "text"),
        _f(6, "Ghi chú", "long_text"))),
    BookTemplate("meeting", "Biên bản họp thành viên", "Lưu biên bản các cuộc họp: ai dự, bàn gì, quyết định gì.",
                 "users", "all", "view", False, (
        _f(1, "Ngày họp", "date", required=True, in_list=True),
        _f(2, "Địa điểm", "text", in_list=True),
        _f(3, "Số người dự", "number", in_list=True, summary=True, unit="người"),
        _f(4, "Nội dung", "long_text", required=True),
        _f(5, "Quyết định", "long_text"),
        _f(6, "Người ghi biên bản", "text", in_list=True))),
    BookTemplate("handover", "Sổ giao nhận vật tư", "Ghi vật tư giao cho nông hộ hoặc nhận lại.", "truck", "all", "none",
                 False, (
        _f(1, "Ngày", "date", required=True, in_list=True),
        _f(2, "Nông hộ", "household", required=True, in_list=True),
        _f(3, "Vật tư", "text", required=True, in_list=True),
        _f(4, "Số lượng", "number", required=True, in_list=True, summary=True),
        _f(5, "Giao hay nhận lại", "choice", required=True, in_list=True, options=("Giao", "Nhận lại")),
        _f(6, "Ghi chú", "long_text"))),
    BookTemplate("pest", "Theo dõi sâu bệnh", "Ghi sâu bệnh phát hiện trên nương chè để xử lý kịp thời.", "map-pinned",
                 "all", "own", False, (
        _f(1, "Ngày phát hiện", "date", required=True, in_list=True),
        _f(2, "Lô chè", "text", required=True, in_list=True),
        _f(3, "Sâu bệnh", "choice", required=True, in_list=True,
           options=("Rầy xanh", "Bọ trĩ", "Bọ xít muỗi", "Nhện đỏ", "Thối búp", "Khác")),
        _f(4, "Mức độ", "choice", in_list=True, options=("Nhẹ", "Vừa", "Nặng")),
        _f(5, "Diện tích bị hại", "number", summary=True, unit="sào"),
        _f(6, "Ghi chú", "long_text"))),
    BookTemplate("visitors", "Sổ khách tham quan", "Ghi các đoàn khách đến thăm đồi chè.", "calendar", "all", "none", False, (
        _f(1, "Ngày", "date", required=True, in_list=True),
        _f(2, "Tên khách hoặc đoàn", "text", required=True, in_list=True),
        _f(3, "Số người", "number", required=True, in_list=True, summary=True, unit="người"),
        _f(4, "Nguồn khách", "choice", in_list=True,
           options=("Công ty du lịch", "Khách lẻ", "Trường học", "Khác")),
        _f(5, "Người đón tiếp", "text"),
        _f(6, "Ghi chú", "long_text"))),
)}
BLANK = BookTemplate("blank", "Sổ chưa đặt tên", "", "clipboard-list", "own", "none", False, ())
