# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""A pytest plugin for the `tests` gate: writes what ran and what was requested to $DXOS_REPORT as JSON.

It records, for every test, its outcome (the call phase, or the setup/teardown phase when that failed) and the HTTP requests
made through Starlette's TestClient while it ran, and at the end the routes of every FastAPI app in the process. The gate
then counts a route as covered only when a test that passed requested it, so file names and test counts mean nothing.
"""
import gc
import json
import os
from urllib.parse import urlsplit

import pytest

_state = {"tests": {}, "requests": [], "current": None}


def pytest_sessionstart(session):
    # Imported now, before any conftest or test can put a file of its own named starlette on sys.path.
    from starlette import testclient

    original = testclient.TestClient.request

    def recording(self, method, url, *args, **kwargs):
        _state["requests"].append({"test": _state["current"], "method": str(method), "path": urlsplit(str(url)).path or "/"})
        return original(self, method, url, *args, **kwargs)

    testclient.TestClient.request = recording


def pytest_runtest_logstart(nodeid, location):
    _state["current"] = nodeid


@pytest.hookimpl(trylast=True)
def pytest_runtest_logreport(report):
    outcome = report.outcome
    if report.when == "call" and getattr(report, "wasxfail", ""):
        outcome = "xfailed" if outcome == "skipped" else "xpassed"
    tests = _state["tests"]
    if report.when == "call":
        if tests.get(report.nodeid) != "failed":
            tests[report.nodeid] = outcome
    elif outcome != "passed":  # a failed or skipped setup, or a failed teardown, is never a pass
        tests[report.nodeid] = "failed" if outcome == "failed" else outcome
    else:
        tests.setdefault(report.nodeid, "passed")


def _routes() -> list[dict]:
    from fastapi import FastAPI

    routes = []
    for app in (o for o in gc.get_objects() if isinstance(o, FastAPI)):
        for route in app.routes:
            methods, regex = getattr(route, "methods", None), getattr(route, "path_regex", None)
            if methods and regex:  # a Mount has neither; its files are not routes of the app
                routes.append({"path": route.path, "regex": regex.pattern, "methods": sorted(m for m in methods if m != "HEAD")})
    return routes


def pytest_sessionfinish(session, exitstatus):
    path = os.environ.get("DXOS_REPORT")
    if not path:
        return
    data = {"exitstatus": int(exitstatus), "tests": [{"nodeid": n, "outcome": o} for n, o in _state["tests"].items()],
            "requests": _state["requests"], "routes": _routes()}
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle)
