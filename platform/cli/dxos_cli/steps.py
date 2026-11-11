# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Nhật ký cài đặt: chạy từng bước, ghi tên bước đã xong, hoàn tác ngược lại khi hỏng (spec §5)."""
import json
from pathlib import Path
from typing import Protocol


class InstallError(Exception):
    pass


class Step(Protocol):
    name: str

    def apply(self) -> None: ...

    def undo(self) -> None: ...


def read_journal(journal: Path) -> dict:
    return json.loads(journal.read_text(encoding="utf-8")) if journal.exists() else {}


def write_journal(journal: Path, state: dict) -> None:
    journal.parent.mkdir(parents=True, exist_ok=True)
    tmp = journal.with_name(journal.name + ".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(journal)  # a crash never leaves a torn journal


def _undo(journal: Path, names: list[str], steps_by_name: dict[str, Step]) -> None:
    for name in reversed(names):
        steps_by_name[name].undo()
    # Only after every undo succeeded: a failed undo keeps the journal so `abort` can retry (undo is idempotent).
    journal.unlink(missing_ok=True)


def run_steps(steps: list[Step], journal: Path) -> None:
    state = read_journal(journal)
    # A re-run keeps the names an earlier run recorded, so a failure now also undoes what that run applied.
    done = state.setdefault("completed", [])
    for step in steps:
        try:
            step.apply()
        except Exception as exc:
            _undo(journal, done, {s.name: s for s in steps})
            raise InstallError(f"Bước '{step.name}' hỏng, đã hoàn tác các bước trước: {exc}") from exc
        if step.name not in done:
            done.append(step.name)
        write_journal(journal, state)


def undo_from_journal(journal: Path, steps_by_name: dict[str, Step]) -> None:
    if journal.exists():
        _undo(journal, read_journal(journal).get("completed", []), steps_by_name)
