# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import logging
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import paho.mqtt.client as mqtt

from .config import Config
from .payload import Rejected, parse_message

log = logging.getLogger("dxos_ingest")

TOPIC_FILTER = "htx/+/plot/+/+"
HEARTBEAT_SECONDS = 30
MAX_REJECT_PAYLOAD = 256

PARCEL_SQL = """
SELECT 1 FROM public.parcels p
JOIN public.households h ON h.id = p.household_id
JOIN public.htx_profiles x ON x.id = h.htx_profile_id
WHERE p.parcel_code = %s AND x.htx_code = %s
LIMIT 1"""
INSERT_SQL = """
INSERT INTO telemetry.sensor_readings (htx_code, parcel_code, sensor, ts, value)
VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING"""
REJECT_SQL = """
INSERT INTO telemetry.ingest_rejects (topic, payload, reason, htx_code)
VALUES (%s, %s, %s, %s)"""


def handle_message(db, topic: str, payload: bytes, now: datetime) -> str:
    """Store or reject one message on an autocommit connection. Returns "stored", "duplicate" or the reject reason."""
    try:
        reading = parse_message(topic, payload, now)
        if db.execute(PARCEL_SQL, (reading.parcel_code, reading.htx_code)).fetchone() is None:
            raise Rejected("unknown_parcel", reading.htx_code)
    except Rejected as rej:
        db.execute(REJECT_SQL, (topic, payload[:MAX_REJECT_PAYLOAD], rej.reason, rej.htx_code))
        return rej.reason
    cur = db.execute(INSERT_SQL, (reading.htx_code, reading.parcel_code, reading.sensor, reading.ts, reading.value))
    return "stored" if cur.rowcount == 1 else "duplicate"


class Worker:
    def __init__(self, cfg: Config, client_factory, connect_db):
        self.cfg = cfg
        self.client_factory = client_factory
        self.connect_db = connect_db
        self.db = None
        self.connected = threading.Event()
        self.rebuild = threading.Event()  # set after a database error: the client was disconnected on purpose
        self.heartbeat = Path(cfg.heartbeat_path)

    def _drop_db(self) -> None:
        if self.db is not None:
            try:
                self.db.close()
            except Exception:
                pass
            self.db = None

    def on_message(self, client, userdata, msg) -> None:
        self.heartbeat.touch()
        try:
            if self.db is None or self.db.closed:
                self.db = self.connect_db()
            result = handle_message(self.db, msg.topic, msg.payload, datetime.now(timezone.utc))
        except Exception:
            # No ack: the broker redelivers once the session reconnects.
            log.exception("database error, dropping connection so the broker redelivers")
            self._drop_db()
            self.rebuild.set()
            client.disconnect()
            return
        if result not in ("stored", "duplicate"):
            log.warning("rejected %s: %s", msg.topic, result)
        client.ack(msg.mid, msg.qos)

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            client.subscribe(TOPIC_FILTER, qos=1)
            self.connected.set()
        else:
            log.error("broker refused connection: %s", reason_code)

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        self.connected.clear()

    def _start_client(self):
        if self.db is None or self.db.closed:
            self.db = self.connect_db()
        client = self.client_factory()
        client.on_connect = self._on_connect
        client.on_disconnect = self._on_disconnect
        client.on_message = self.on_message
        client.connect(self.cfg.mqtt_host, self.cfg.mqtt_port, keepalive=30)
        client.loop_start()
        return client

    def run(self, stop: threading.Event) -> None:
        client = None
        last_beat = float("-inf")
        while not stop.is_set():
            if client is None or self.rebuild.is_set():
                if client is not None:
                    client.loop_stop()
                    client = None
                self.rebuild.clear()
                try:
                    client = self._start_client()
                except Exception:
                    log.exception("startup failed (database or broker unavailable), retrying")
                    self._drop_db()
                    stop.wait(5)
                    continue
            if self.connected.is_set() and time.monotonic() - last_beat >= HEARTBEAT_SECONDS:  # only a connected worker is healthy
                self.heartbeat.touch()
                last_beat = time.monotonic()
            stop.wait(1)  # short tick so a database-error rebuild is noticed quickly
        if client is not None:
            client.disconnect()
            client.loop_stop()
        self._drop_db()


def make_client(cfg: Config) -> mqtt.Client:
    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2, client_id="dxos-ingest", clean_session=False,
        protocol=mqtt.MQTTv311, manual_ack=True,
    )
    client.username_pw_set("dxos-ingest", cfg.mqtt_ingest_password)
    return client
