# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Serves the app with the sample core answers under the production CSP, for a reviewer to look at it in a browser.

    python tests/preview.py [port] [--empty]

Not part of the app: no database, no real token. `--empty` answers every query with an empty cooperative. The fixed clock
of the sample is 20/11/2026 10:00 (Vietnam). The page is viewed through the app's own address, /apps/htx-dashboard/.
"""
import base64
import json
import re
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
REPO = APP_DIR.parents[1]
sys.path.insert(0, str(APP_DIR))
sys.path.insert(0, str(APP_DIR / "tests"))

import sample  # noqa: E402
import uvicorn  # noqa: E402
from starlette.applications import Starlette  # noqa: E402
from starlette.responses import FileResponse  # noqa: E402
from starlette.routing import Mount, Route  # noqa: E402

from htx_dashboard import core_client, main  # noqa: E402

CSP = ("default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; "
       "frame-ancestors 'self'")
CLAIMS = {"sub": "kc-1", "name": "Quản trị TC", "htx_code": "TC", "realm_access": {"roles": ["manager"]}}
TOKEN = "Bearer h." + base64.urlsafe_b64encode(json.dumps(CLAIMS).encode()).decode().rstrip("=") + ".s"
ROOT_FIELDS = re.compile(r"\b(parcels|households|journal_entries|disease_reports|lots|telemetry_sensor_readings|"
                         r"telemetry_sensor_daily|telemetry_lifecycle_runs|market_data|weather_cache|platform_agent_proposals|platform_agent_runs|"
                         r"platform_improvements)\(")


def empty_answer(payload: dict) -> dict:
    """Every root field empty and every count zero: a cooperative that has just started."""
    query = payload["query"]
    if query == core_client.JOURNAL_COUNTS:
        zero = {"aggregate": {"count": 0}}
        return {"data": {"in_period": zero, "previous": zero, "pending": zero, "changes": zero}}
    return {"data": {name: [] for name in ROOT_FIELDS.findall(query)}}


def answer(payload: dict) -> dict:
    return empty_answer(payload) if EMPTY else sample.answer(payload)


EMPTY = "--empty" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]
PORT = int(args[0]) if args else 8791

main.core = core_client.Core(lambda authorization, role, payload, timeout: answer(payload))
main.now = lambda: sample.NOW


class AddToken:
    """The web proxy adds the viewer's token; here every request gets the sample manager's."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            scope["headers"] = [(k, v) for k, v in scope["headers"] if k != b"authorization"] + [(b"authorization", TOKEN.encode())]

            async def send_csp(message):
                if message["type"] == "http.response.start":
                    message["headers"] = list(message.get("headers", [])) + [
                        (b"content-security-policy", CSP.encode()), (b"x-content-type-options", b"nosniff")]
                await send(message)
            return await self.app(scope, receive, send_csp)
        return await self.app(scope, receive, send)


css = REPO / "apps/web/public/dxos-app.css"
shell = Starlette(routes=[Route("/dxos-app.css", lambda r: FileResponse(css, media_type="text/css")),
                          Mount("/apps/htx-dashboard", app=main.app)])

if __name__ == "__main__":
    print(f"htx-dashboard preview{' (empty cooperative)' if EMPTY else ''}: http://127.0.0.1:{PORT}/apps/htx-dashboard/")
    uvicorn.run(AddToken(shell), host="127.0.0.1", port=PORT, log_level="warning")
