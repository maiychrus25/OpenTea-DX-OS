# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""QR codes as data URIs for <img src>: the page CSP allows img-src data: and has no style attribute to carry a size."""
import segno


def qr_data_uri(text: str) -> str:
    """An SVG QR on a white ground (it stays scannable on a dark page), about 29 modules wide for a VietQR payload."""
    return segno.make(text, error="m", micro=False).svg_data_uri(scale=6, border=2, dark="#000000", light="#ffffff",
                                                                   xmldecl=False, svgns=True)


def ticket_text(htx_code: str, code: str) -> str:
    """What the ticket QR holds (spec 7.5)."""
    return f"OPENTEA-TOUR:{htx_code}:{code}"
