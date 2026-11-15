# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Text rules: slugs, phone numbers, display names."""
import re
import unicodedata

SLUG_MAX = 80
DISPLAY_NAME_MAX = 40


def slugify(title: str) -> str:
    """Latin letters and digits joined by single hyphens; Vietnamese marks and đ are folded away. Never empty."""
    folded = unicodedata.normalize("NFKD", title.replace("đ", "d").replace("Đ", "D")).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", folded.lower()).strip("-")[:SLUG_MAX].rstrip("-")
    return slug or "tour"


def normalise_phone(raw: str) -> str | None:
    """0 and 9 digits; spaces, dots and hyphens are ignored and +84 becomes 0. Anything else is None."""
    phone = re.sub(r"[ .\-]", "", raw.strip())
    if phone.startswith("+84"):
        phone = "0" + phone[3:]
    return phone if re.fullmatch(r"0[0-9]{9}", phone) else None


def default_display_name(guest_name: str) -> str:
    """The calling name of a Vietnamese full name is its last word."""
    words = guest_name.split()
    return (words[-1] if words else "Khách")[:DISPLAY_NAME_MAX]
