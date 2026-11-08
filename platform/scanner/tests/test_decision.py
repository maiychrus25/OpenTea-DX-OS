# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from dxos_scanner.clamd import ScanResult
from dxos_scanner.decision import Action, decide


def test_decide():
    assert decide(ScanResult("clean", None)) is Action.KEEP
    assert decide(ScanResult("infected", "Eicar")) is Action.QUARANTINE
    assert decide(ScanResult("unscannable", "boom")) is Action.QUARANTINE
