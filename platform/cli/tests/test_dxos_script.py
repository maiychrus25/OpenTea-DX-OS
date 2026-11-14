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


def run_guard(container, source, runtime="docker/runtime/docker", docker_rc=0):
    """Source the real gateway_guard() with stub compose and docker functions."""
    body = subprocess.run(["sed", "-n", "/^gateway_guard()/,/^}/p", str(DXOS)], capture_output=True, text=True).stdout
    snippet = (f"set -e\nRUNTIME='{runtime}'\ncompose() {{ echo '{container}'; }}\n"
               f"docker() {{ echo '{source}'; return {docker_rc}; }}\n{body}\n"
               "gateway_guard\necho still-running\n")
    return subprocess.run(["bash", "-c", snippet], capture_output=True, text=True)


def test_guard_passes_without_a_gateway_container():
    run = run_guard("", "/x/platform/gateway/apisix.yaml")
    assert run.returncode == 0 and run.stderr == ""


def test_guard_passes_on_the_runtime_route_file():
    run = run_guard("abc123", "/x/docker/runtime/docker/gateway/apisix.yaml")
    assert run.returncode == 0 and "still-running" in run.stdout


def test_guard_refuses_the_base_route_file():
    run = run_guard("abc123", "/x/platform/gateway/apisix.yaml")
    assert run.returncode == 1 and "still-running" not in run.stdout
    assert "make gateway-up" in run.stderr and "docker/runtime/docker/gateway/apisix.yaml" in run.stderr


def test_guard_never_blocks_on_its_own_failure():
    assert run_guard("abc123", "", docker_rc=1).returncode == 0
    assert run_guard("abc123", "").returncode == 0


def test_install_and_worker_call_the_guard():
    text = DXOS.read_text()
    for name in ("install", "worker"):
        body = subprocess.run(["sed", "-n", f"/^{name}()/,/^}}/p", str(DXOS)], capture_output=True, text=True).stdout
        assert "gateway_guard" in body


def test_upgrade_runs_the_guard_then_the_three_steps_in_order(tmp_path):
    body = subprocess.run(["sed", "-n", "/^upgrade()/,/^}/p", str(DXOS)], capture_output=True, text=True).stdout
    snippet = (f"set -e\nlog() {{ echo \"$@\" >>{tmp_path}/calls; }}\n"
               "gateway_guard() { log guard; }\n"
               "cli() { log \"cli $*\"; case \"$1\" in manifest-id) echo tea-tour;; list) printf 'tea-tour\\t0.1.0\\tx\\n';; esac; }\n"
               "app() { log \"app $*\"; }\n"
               f"{body}\nupgrade /repo/miniapps/tea-tour\n")
    run = subprocess.run(["bash", "-c", snippet], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr
    calls = (tmp_path / "calls").read_text().splitlines()
    assert calls == ["guard", "cli manifest-id /repo/miniapps/tea-tour", "cli list",
                     "cli upgrade-prepare /repo/miniapps/tea-tour", "app tea-tour up -d --build --wait app-tea-tour",
                     "cli upgrade-commit tea-tour", "cli list"]
    assert run.stdout.strip() == "Đã nâng cấp tea-tour lên 0.1.0"  # the stub's list reports 0.1.0 both times


def test_upgrade_failure_keeps_the_old_version_and_says_so(tmp_path):
    body = subprocess.run(["sed", "-n", "/^upgrade()/,/^}/p", str(DXOS)], capture_output=True, text=True).stdout
    snippet = ("gateway_guard() { :; }\n"
               "cli() { case \"$1\" in manifest-id) echo tea-tour;; list) printf 'tea-tour\\t0.1.0\\tx\\n';; esac; }\n"
               "app() { return 1; }\n"
               f"{body}\nupgrade /repo/miniapps/tea-tour\n")
    run = subprocess.run(["bash", "-c", snippet], capture_output=True, text=True)
    assert run.returncode == 1
    assert "Nâng cấp tea-tour hỏng; bản đang đăng ký vẫn là 0.1.0" in run.stderr


def test_usage_lists_upgrade():
    assert "upgrade <dir>" in DXOS.read_text()
