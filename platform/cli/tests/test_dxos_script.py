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


def test_agent_enable_refuses_an_unknown_cooperative_before_keycloak(tmp_path):
    """Source the real agent_enable() with stubs: no cooperative row means no Keycloak call."""
    body = subprocess.run(["sed", "-n", "/^agent_enable()/,/^}/p", str(DXOS)], capture_output=True, text=True).stdout
    snippet = (f"set -e\nRUNTIME='docker/runtime/docker'\nHTX_RE='^[A-Z0-9_-]{{1,20}}$'\n"
               f"compose() {{ echo \"$@\" >>{tmp_path}/calls; }}\n"
               f"kc_exec() {{ echo keycloak >>{tmp_path}/calls; echo secret; }}\n"
               f"{body}\nagent_enable TC\necho still-running\n")
    run = subprocess.run(["bash", "-c", snippet], capture_output=True, text=True)
    assert run.returncode == 1 and "still-running" not in run.stdout
    assert "htx_profiles" in run.stderr
    calls = (tmp_path / "calls").read_text()
    assert "psql" in calls and "keycloak" not in calls


def test_agent_credentials_reach_the_helper_on_stdin_only(tmp_path):
    """The secret must never appear in the helper's argv, so `ps` cannot show it."""
    body = subprocess.run(["sed", "-n", "/^agent_env_write()/,/^}/p", str(DXOS)], capture_output=True, text=True).stdout
    stub = f"compose() {{ echo \"$@\" >{tmp_path}/args; cat >{tmp_path}/stdin; }}"
    snippet = (f"set -e\n{stub}\n{body}\n"
               "printf 'DXOS_AGENT_CLIENT_SECRET=s3cret\\n' | agent_env_write TC.env\n")
    run = subprocess.run(["bash", "-c", snippet], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr
    args = (tmp_path / "args").read_text()
    assert "s3cret" not in args and "TC.env" in args
    assert (tmp_path / "stdin").read_text() == "DXOS_AGENT_CLIENT_SECRET=s3cret\n"


def test_telegram_credentials_reach_the_helper_on_stdin_only(tmp_path):
    """The relay and roles secrets must never appear in the helper's argv."""
    body = subprocess.run(["sed", "-n", "/^telegram_env_write()/,/^}/p", str(DXOS)], capture_output=True, text=True).stdout
    stub = f"compose() {{ echo \"$@\" >{tmp_path}/args; cat >{tmp_path}/stdin; }}"
    snippet = (f"set -e\n{stub}\n{body}\n"
               "printf 'DXOS_TELEGRAM_CLIENT_SECRET=s3cret\\n' | telegram_env_write /run/dxos-telegram telegram.env\n")
    run = subprocess.run(["bash", "-c", snippet], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr
    args = (tmp_path / "args").read_text()
    assert "s3cret" not in args and "telegram.env" in args and "dxos-telegram-env" in args
    assert (tmp_path / "stdin").read_text() == "DXOS_TELEGRAM_CLIENT_SECRET=s3cret\n"


def test_telegram_disable_removes_its_credentials_and_clients(tmp_path):
    body = subprocess.run(["sed", "-n", "/^telegram_disable()/,/^}/p", str(DXOS)], capture_output=True, text=True).stdout
    snippet = (f"set -e\nkc_exec() {{ echo kc >>{tmp_path}/calls; }}\n"
               f"telegram_env_remove() {{ echo \"rm $1/$2\" >>{tmp_path}/calls; }}\n"
               f"roles_env_update() {{ echo \"drop $*\" >>{tmp_path}/calls; }}\n"
               "telegram_restart() { echo restart >>" f"{tmp_path}/calls; }}\n"
               f"{body}\ntelegram_disable\n")
    run = subprocess.run(["bash", "-c", snippet], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr
    assert (tmp_path / "calls").read_text().splitlines() == [
        "kc", "rm /run/dxos-telegram/telegram.env", "drop DXOS_ROLES_CLIENT_ID DXOS_ROLES_CLIENT_SECRET", "restart",
    ]


def test_telegram_is_in_usage_and_takes_one_action():
    text = DXOS.read_text()
    assert "telegram <enable|disable>" in text
    assert "telegram)" in text and "[ $# -eq 1 ] || usage" in text


def run_roles_env_update(tmp_path, existing, keys, new):
    """Source the real roles_env_update() with stubs for the helper container; returns (written file or None, removed?)."""
    body = subprocess.run(["sed", "-n", "/^roles_env_update()/,/^}/p", str(DXOS)], capture_output=True, text=True).stdout
    (tmp_path / "existing").write_text(existing)
    snippet = (f"set -euo pipefail\nroles_env_read() {{ cat {tmp_path}/existing; }}\n"
               f"telegram_env_write() {{ echo \"$1 $2\" >{tmp_path}/target; cat >{tmp_path}/written; }}\n"
               f"telegram_env_remove() {{ echo \"$1 $2\" >{tmp_path}/removed; }}\n{body}\n"
               f"printf '%s' '{new}' | roles_env_update {keys}\n")
    run = subprocess.run(["bash", "-c", snippet], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr
    written = (tmp_path / "written").read_text() if (tmp_path / "written").exists() else None
    return written, (tmp_path / "removed").exists()


def test_roles_env_update_replaces_its_keys_and_keeps_the_others(tmp_path):
    existing = "DXOS_ROLES_CLIENT_ID=dxos-web-roles\nDXOS_ROLES_CLIENT_SECRET=old\nDXOS_APPS_ACTOR_SECRET=keep\n"
    written, removed = run_roles_env_update(
        tmp_path, existing, "DXOS_ROLES_CLIENT_ID DXOS_ROLES_CLIENT_SECRET",
        "DXOS_ROLES_CLIENT_ID=dxos-web-roles\nDXOS_ROLES_CLIENT_SECRET=new\n")
    assert sorted(written.splitlines()) == [
        "DXOS_APPS_ACTOR_SECRET=keep", "DXOS_ROLES_CLIENT_ID=dxos-web-roles", "DXOS_ROLES_CLIENT_SECRET=new"]
    assert not removed
    assert (tmp_path / "target").read_text() == "/run/dxos-web roles.env\n"


def test_roles_env_update_on_a_missing_file_writes_only_the_new_lines(tmp_path):
    written, _ = run_roles_env_update(tmp_path, "", "DXOS_APPS_ACTOR_SECRET", "DXOS_APPS_ACTOR_SECRET=s3\n")
    assert written == "DXOS_APPS_ACTOR_SECRET=s3\n"


def test_roles_env_update_with_nothing_left_removes_the_file(tmp_path):
    written, removed = run_roles_env_update(
        tmp_path, "DXOS_ROLES_CLIENT_ID=x\nDXOS_ROLES_CLIENT_SECRET=y\n", "DXOS_ROLES_CLIENT_ID DXOS_ROLES_CLIENT_SECRET", "")
    assert written is None and removed


def test_apps_actor_enable_is_wired_and_never_prints_the_secret():
    text = DXOS.read_text()
    assert "apps actor <enable>" in text or "apps actor enable" in text
    body = subprocess.run(["sed", "-n", "/^apps_actor_enable()/,/^}/p", str(DXOS)], capture_output=True, text=True).stdout
    assert "dxos-apps-actor" in body and "roles_env_update DXOS_APPS_ACTOR_SECRET" in body
    assert body.count("$secret") == 2  # the emptiness check and the one pipe into the helper; never an echo
    assert "echo" not in body.split("printf 'DXOS_APPS_ACTOR_SECRET")[1].split("\n")[0]
