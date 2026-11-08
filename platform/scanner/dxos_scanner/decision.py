# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from enum import Enum

from .clamd import ScanResult


class Action(Enum):
    KEEP = "keep"
    QUARANTINE = "quarantine"


def decide(result: ScanResult) -> Action:
    return Action.KEEP if result.status == "clean" else Action.QUARANTINE
