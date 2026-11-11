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
    if not journal.exists():
        return {}
    try:
        state = json.loads(journal.read_text(encoding="utf-8"))
    except ValueError as exc:  # JSONDecodeError and UnicodeDecodeError
        raise InstallError(f"Nhật ký {journal} hỏng, không đọc được: {exc}") from exc
    if not isinstance(state, dict) or not isinstance(state.get("completed", []), list):
        raise InstallError(f"Nhật ký {journal} hỏng: cần một đối tượng có 'completed' là danh sách")
    return state


def write_journal(journal: Path, state: dict) -> None:
    journal.parent.mkdir(parents=True, exist_ok=True)
    tmp = journal.with_name(journal.name + ".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(journal)  # a crash never leaves a torn journal


def _undo(journal: Path, names: list[str], steps_by_name: dict[str, Step]) -> None:
    unknown = [name for name in names if not isinstance(name, str) or name not in steps_by_name]
    if unknown:
        raise InstallError(f"Nhật ký {journal} có bước không biết: {unknown}")
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
            try:
                _undo(journal, done, {s.name: s for s in steps})
            except Exception as undo_exc:
                raise InstallError(f"Bước '{step.name}' hỏng: {exc}; hoàn tác cũng hỏng: {undo_exc} "
                                   "(nhật ký được giữ, chạy abort để thử lại)") from exc
            raise InstallError(f"Bước '{step.name}' hỏng, đã hoàn tác các bước trước: {exc}") from exc
        if step.name not in done:
            done.append(step.name)
        write_journal(journal, state)


def undo_from_journal(journal: Path, steps_by_name: dict[str, Step]) -> None:
    if journal.exists():
        _undo(journal, read_journal(journal).get("completed", []), steps_by_name)
