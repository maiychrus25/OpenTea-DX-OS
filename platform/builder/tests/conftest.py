# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The gate tests import PyYAML, jsonschema and psycopg (the image has them). When the interpreter lacks them, run again
under `uv run` with them, so `uvx pytest platform/builder/tests` works as it is."""
import os
import sys

try:
    import jsonschema  # noqa: F401
    import psycopg  # noqa: F401
    import yaml  # noqa: F401
    MISSING = False
except ImportError:
    MISSING = True


def pytest_configure(config):
    if not MISSING:
        return
    if os.environ.get("DXOS_BUILDER_TESTS_REEXEC"):
        raise RuntimeError("PyYAML, jsonschema and psycopg are still missing after the re-run")
    os.environ["DXOS_BUILDER_TESTS_REEXEC"] = "1"
    config.pluginmanager.getplugin("capturemanager").stop_global_capturing()  # the new process must own stdout again
    os.execvp("uv", ["uv", "run", "--no-project", "--python", "3.12", "--with", "pytest", "--with", "pyyaml", "--with", "jsonschema",
                     "--with", "psycopg[binary]", "python", "-m", "pytest", *sys.argv[1:]])
