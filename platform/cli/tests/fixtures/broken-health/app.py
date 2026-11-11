# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Smoke fixture: every request answers 500, so the compose health check fails and the install must be undone."""
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(500)
        self.send_header("Content-Length", "0")
        self.end_headers()


HTTPServer(("", 8080), Handler).serve_forever()
