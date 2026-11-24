# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Masks personal data in prompts before an external provider sees them (spec §8.3)."""
import re
from typing import Sequence

from .base import LLMMessage

MASK = "[đã ẩn]"
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# Word boundaries keep ids (cuids, UUID segments) and other tokens with digits in them intact.
PHONE_RE = re.compile(r"(?<![\w-])(?:\+84|0)[ .]?\d(?:[ .]?\d){8,9}(?![\w-])")
ID_NUMBER_RE = re.compile(r"(?<![\w-])(?:\d{9}|\d{12})(?![\w-])")


def redact_text(text: str) -> str:
    """Replace e-mail addresses, Vietnamese phone numbers and 9- or 12-digit identity numbers."""
    text = EMAIL_RE.sub(MASK, text)
    text = PHONE_RE.sub(MASK, text)
    return ID_NUMBER_RE.sub(MASK, text)


def redact_messages(messages: Sequence[LLMMessage]) -> list[LLMMessage]:
    return [LLMMessage(role=msg.role, content=redact_text(msg.content)) for msg in messages]
