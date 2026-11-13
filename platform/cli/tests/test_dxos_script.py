# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import subprocess
from pathlib import Path

DXOS = Path(__file__).resolve().parents[3] / "dxos"


def run_progress(tmp_path, job):
    """Source the real progress() with a stub cli that logs its arguments and fails."""
    body = subprocess.run(["sed", "-n", "/^progress()/,/^}/p", str(DXOS)], capture_output=True, text=True).stdout
    snippet = (f"set -e\ncli() {{ echo \"$@\" >>{tmp_path}/calls; return 1; }}\n{body}\n"
               f"DXOS_JOB='{job}'\nprogress build\necho still-running\n")
    return subprocess.run(["bash", "-c", snippet], capture_output=True, text=True)


def test_progress_failure_does_not_stop_install(tmp_path):
    run = run_progress(tmp_path, "job-1")
    assert run.returncode == 0 and "still-running" in run.stdout
    assert (tmp_path / "calls").read_text() == "worker-progress job-1 build\n"


def test_progress_without_job_calls_nothing(tmp_path):
    assert run_progress(tmp_path, "").returncode == 0
    assert not (tmp_path / "calls").exists()


def test_install_and_worker_report_their_phases():
    text = DXOS.read_text()
    for phase in ("prepare", "build", "register"):
        assert f"progress {phase}" in text
    assert 'DXOS_JOB="$job"' in text
