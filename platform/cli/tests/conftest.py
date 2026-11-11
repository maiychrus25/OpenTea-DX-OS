# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import os
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("DXOS_REPO_ROOT", str(Path(__file__).resolve().parents[3]))

PG_IMAGE = "opentea-dx-os/postgres:local"
INIT_DIR = Path(__file__).resolve().parents[2] / "postgres" / "init"


def _docker(*args: str, stdin: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", *args], input=stdin, capture_output=True, text=True)


@pytest.fixture(scope="session")
def pg_url():
    """Throwaway Postgres (no volume) with platform/postgres/init/*.sql applied twice, like make platform-up."""
    if not shutil.which("docker") or _docker("info").returncode:
        reason = "docker không chạy được"
    elif _docker("image", "inspect", PG_IMAGE).returncode:
        reason = f"thiếu image {PG_IMAGE} (docker build -t {PG_IMAGE} platform/postgres)"
    else:
        reason = None
    if reason:
        # CI must run the registry tests, so a missing docker there is a failure, not a skip.
        if os.environ.get("CI"):
            pytest.fail(f"Test Postgres: {reason}")
        pytest.skip(f"Bỏ qua test cần Postgres: {reason}")
    name = f"dxos-cli-test-{uuid.uuid4().hex[:12]}"
    started = _docker("run", "--rm", "-d", "--name", name, "-e", "POSTGRES_USER=agrimarket",
                      "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", PG_IMAGE)
    assert started.returncode == 0, started.stderr
    try:
        # TCP only answers once the entrypoint's socket-only init server has made way for the real one.
        for _ in range(240):
            if _docker("exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "agrimarket").returncode == 0:
                break
            time.sleep(0.5)
        else:
            pytest.fail("Test Postgres không sẵn sàng sau 120 s")
        for _ in range(2):
            for sql in sorted(INIT_DIR.glob("*.sql")):
                applied = _docker("exec", "-i", name, "psql", "-U", "agrimarket", "-d", "agrimarket", "-q",
                                  "-v", "ON_ERROR_STOP=1", stdin=sql.read_text(encoding="utf-8"))
                assert applied.returncode == 0, f"{sql.name}: {applied.stderr}"
        port = _docker("port", name, "5432/tcp").stdout.splitlines()[0].rsplit(":", 1)[1]
        yield f"postgresql://agrimarket:test@127.0.0.1:{port}/agrimarket"
    finally:
        _docker("rm", "-f", name)
