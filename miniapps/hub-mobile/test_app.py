# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Run from this directory: python -m unittest. Standard library only, like the app."""
import http.client
import os
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest import mock

import app


class HubMobileTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def get(self, path):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        conn.request("GET", path)
        resp = conn.getresponse()
        return resp.status, resp.read().decode()

    def test_health_and_unknown_pages(self):
        self.assertEqual(self.get("/healthz"), (200, "ok"))
        self.assertEqual(self.get("/nope")[0], 404)
        self.assertEqual(self.get("/public/")[0], 404)
        self.assertEqual(self.get("/public/a%20b")[0], 404)
        self.assertEqual(self.get("/public/TC/extra")[0], 404)

    def test_public_and_signed_in_pages_show_the_default_apk_link(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            for path in ("/", "/public/TC"):
                status, body = self.get(path)
                self.assertEqual(status, 200)
                self.assertIn(f'href="{app.DEFAULT_APK}"', body)
                self.assertIn("Bản cho iPhone chưa sẵn sàng", body)

    def test_configured_links_are_used_and_escaped(self):
        env = {"HUB_APK_URL": 'https://x.test/a.apk?q="1"', "HUB_WEB_URL": "https://web.test/app"}
        with mock.patch.dict(os.environ, env, clear=True):
            _, body = self.get("/")
        self.assertIn("https://x.test/a.apk?q=&quot;1&quot;", body)
        self.assertIn('href="https://web.test/app"', body)
        self.assertIn("Thêm vào Màn hình chính", body)

    def test_non_http_links_are_ignored(self):
        env = {"HUB_APK_URL": "javascript:alert(1)", "HUB_WEB_URL": "ftp://x"}
        with mock.patch.dict(os.environ, env, clear=True):
            _, body = self.get("/")
        self.assertIn(f'href="{app.DEFAULT_APK}"', body)
        self.assertNotIn("javascript:", body)
        self.assertIn("Bản cho iPhone chưa sẵn sàng", body)

    def test_theme_is_only_light_or_dark(self):
        self.assertIn('<html lang="vi" data-theme="dark">', self.get("/?theme=dark")[1])
        self.assertNotIn("data-theme", self.get("/?theme=evil")[1])


if __name__ == "__main__":
    unittest.main()
