# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""DXOS_LABS freezes the staff, app-builder and strategy agents and the autopilot tick (ADR 0005)."""
from datetime import datetime, timezone

import pytest

from dxos_agent import __main__ as agent_main
from tests.test_main import cooperative  # noqa: F401  (fixture)

NOW = datetime(2026, 11, 24, 3, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize("value, expected", [(None, False), ("", False), ("0", False), ("false", False), ("1", True), ("true", True)])
def test_labs_enabled_rule(monkeypatch, value, expected):
    if value is None:
        monkeypatch.delenv("DXOS_LABS", raising=False)
    else:
        monkeypatch.setenv("DXOS_LABS", value)
    assert agent_main.labs_enabled() is expected


@pytest.fixture
def frozen_calls(monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(agent_main.staff_tasks, "run_staff_tasks", lambda *a, **k: calls.append("staff"))
    monkeypatch.setattr(agent_main.app_builder, "run_app_builder", lambda *a, **k: calls.append("app-builder"))
    monkeypatch.setattr(agent_main.strategy, "run_strategy", lambda *a, **k: calls.append("strategy"))
    return calls


def test_frozen_cycles_do_not_run_without_labs(monkeypatch, cooperative, frozen_calls):  # noqa: F811
    monkeypatch.delenv("DXOS_LABS", raising=False)
    cfg, gateway = cooperative
    agent_main.run_once(cfg, {}, now=NOW)
    assert frozen_calls == []
    assert getattr(gateway, "ticks", 0) == 0


def test_frozen_cycles_run_with_labs(monkeypatch, cooperative, frozen_calls):  # noqa: F811
    monkeypatch.setenv("DXOS_LABS", "1")
    cfg, gateway = cooperative
    agent_main.run_once(cfg, {}, now=NOW)
    assert "staff" in frozen_calls and "app-builder" in frozen_calls
    assert gateway.ticks == 1
