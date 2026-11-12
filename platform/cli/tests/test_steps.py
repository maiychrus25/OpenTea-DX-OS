# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from dxos_cli.steps import InstallError, run_steps, undo_from_journal


class Recorder:
    def __init__(self, name, log, fail=False):
        self.name, self.log, self.fail = name, log, fail

    def apply(self):
        self.log.append(f"apply {self.name}")
        if self.fail:
            raise RuntimeError("boom")

    def undo(self):
        self.log.append(f"undo {self.name}")


def test_failure_undoes_completed_steps_in_reverse(tmp_path):
    log = []
    journal = tmp_path / "demo.pending.json"
    steps = [Recorder("a", log), Recorder("b", log), Recorder("c", log, fail=True), Recorder("d", log)]
    with pytest.raises(InstallError, match="boom"):
        run_steps(steps, journal)
    assert log == ["apply a", "apply b", "apply c", "undo b", "undo a"]
    assert not journal.exists()


def test_undo_from_journal_after_process_exit(tmp_path):
    journal = tmp_path / "demo.pending.json"
    # A separate process completes a and b, then dies inside c without any chance to clean up.
    script = textwrap.dedent("""
        import os, sys
        from pathlib import Path
        from dxos_cli.steps import run_steps

        class Step:
            def __init__(self, name):
                self.name = name
            def apply(self):
                if self.name == "c":
                    os._exit(3)
            def undo(self):
                raise AssertionError("must not undo in the dying process")

        run_steps([Step("a"), Step("b"), Step("c")], Path(sys.argv[1]))
    """)
    result = subprocess.run([sys.executable, "-c", script, str(journal)],
                            cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True)
    assert result.returncode == 3, result.stderr
    assert journal.exists()

    log = []
    undo_from_journal(journal, {name: Recorder(name, log) for name in "abc"})
    assert log == ["undo b", "undo a"]
    assert not journal.exists()
    undo_from_journal(journal, {})  # nothing pending: a second abort is a no-op


def test_failed_undo_names_both_errors(tmp_path):
    class BadUndo(Recorder):
        def undo(self):
            raise RuntimeError("undo broke")

    journal = tmp_path / "demo.pending.json"
    with pytest.raises(InstallError, match="boom.*undo broke") as info:
        run_steps([BadUndo("a", []), Recorder("b", [], fail=True)], journal)
    assert str(info.value.__cause__) == "boom"
    assert journal.exists()  # kept, so abort can retry


@pytest.mark.parametrize("text", ["{not json", "[1, 2]", '{"completed": "a"}', '{"completed": ["a", "zzz"]}',
                                  '{"completed": [{"x": 1}]}'])
def test_bad_journal_raises_install_error(tmp_path, text):
    journal = tmp_path / "demo.pending.json"
    journal.write_text(text)
    with pytest.raises(InstallError, match="Nhật ký"):
        undo_from_journal(journal, {"a": Recorder("a", [])})
    with pytest.raises(InstallError, match="Nhật ký"):
        run_steps([Recorder("a", [], fail=True)], journal)
