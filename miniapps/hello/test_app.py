# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Run from this directory: python -m unittest. Standard library only, like the app."""
import base64
import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer

import app


def bearer(claims) -> str:
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"Bearer h.{payload}.s"


class HelloTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def request(self, method, path, headers=None, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        conn.request(method, path, body=body, headers=headers or {})
        resp = conn.getresponse()
        return resp.status, resp.read().decode()

    def test_greets_name_htx_and_role(self):
        auth = bearer({"name": "An <b>", "htx_code": "TC", "realm_access": {"roles": ["manager", "x"]}})
        status, body = self.request("GET", "/", {"Authorization": auth})
        self.assertEqual(status, 200)
        self.assertIn("Xin chào An &lt;b&gt;, HTX TC, vai trò manager", body)

    def test_odd_realm_access_means_no_roles(self):
        for realm_access in (["manager"], "manager", {"roles": "manager"}):
            status, body = self.request("GET", "/", {"Authorization": bearer({"realm_access": realm_access})})
            self.assertEqual(status, 200, realm_access)
            self.assertIn("vai trò </h1>", body)

    def test_echo_refuses_a_non_ascii_digit_length(self):
        auth = bearer({"sub": "x"})
        status, _ = self.request("POST", "/echo", {"Authorization": auth, "Content-Length": "²"}, body=b"")
        self.assertEqual(status, 413)

    def test_echo_without_token_is_401(self):
        status, _ = self.request("POST", "/echo", body=b"message=x")
        self.assertEqual(status, 401)


if __name__ == "__main__":
    unittest.main()
