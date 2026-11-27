# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Test-only stand-in for Piper's Wyoming server (standard library only): answers any text with a short silent clip.

The assistant smoke runs it under the network alias `piper` to check that `Nghe` sends a WAV document; the real voice is too
heavy for CI. One request per connection: a `synthesize` line in, an `audio-chunk` and an `audio-stop` out.
"""
import json
import os
import socketserver

RATE = 22050
SAMPLES = 2205  # a tenth of a second of silence


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        request = json.loads(self.rfile.readline() or b"{}")
        if request.get("type") != "synthesize":
            return
        data = json.dumps({"rate": RATE, "width": 2, "channels": 1}).encode("utf-8")
        payload = bytes(SAMPLES * 2)
        header = json.dumps({"type": "audio-chunk", "data_length": len(data), "payload_length": len(payload)}).encode("utf-8")
        self.wfile.write(header + b"\n" + data + payload + b'{"type": "audio-stop"}\n')


def make_server(port, host="0.0.0.0"):
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    return socketserver.ThreadingTCPServer((host, port), Handler)


if __name__ == "__main__":
    make_server(int(os.environ.get("DXOS_TTS_STUB_PORT", "10200"))).serve_forever()
