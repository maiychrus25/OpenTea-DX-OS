# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from dxos_dataops.config import Config
from dxos_dataops.ingest import Worker, handle_message

NOW = datetime(2026, 11, 9, 8, 0, tzinfo=timezone.utc)
TOPIC = "htx/TC/plot/P-TC-001/soil_moisture"
BODY = b'{"ts":"2026-11-09T07:59:00Z","value":23.4}'


class FakeCursor:
    def __init__(self, rowcount=0, row=None):
        self.rowcount = rowcount
        self._row = row

    def fetchone(self):
        return self._row


class FakeDb:
    """Autocommit psycopg stand-in. `store` and `rejects` outlive connections, like the real tables."""

    def __init__(self, log, store, rejects, parcels=(("TC", "P-TC-001"),)):
        self.log = log
        self.store = store
        self.rejects = rejects
        self.parcels = set(parcels)
        self.fail = False
        self.closed = False

    def execute(self, sql, params=()):
        if self.fail:
            raise RuntimeError("db down")
        if "FROM public.parcels" in sql:
            return FakeCursor(row=(1,) if (params[1], params[0]) in self.parcels else None)
        if "INSERT INTO telemetry.sensor_readings" in sql:
            key = params[:4]
            self.log.append(("insert", key))
            if key in self.store:
                return FakeCursor(0)
            self.store[key] = params[4]
            return FakeCursor(1)
        if "INSERT INTO telemetry.ingest_rejects" in sql:
            self.log.append(("reject", params))
            self.rejects.append(params)
            return FakeCursor(1)
        raise AssertionError(sql)

    def close(self):
        self.closed = True


class FakeClient:
    def __init__(self, log):
        self.log = log
        self.disconnected = False

    def ack(self, mid, qos):
        self.log.append(("ack", mid, qos))

    def disconnect(self):
        self.disconnected = True


def live_body(minutes_ago=1):
    # Worker.on_message uses the real clock, so its messages must be timestamped relative to it.
    ts = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()
    return f'{{"ts":"{ts}","value":1}}'.encode()


def msg(topic=TOPIC, payload=None, mid=7):
    payload = payload or live_body()
    return SimpleNamespace(topic=topic, payload=payload, mid=mid, qos=1)


@pytest.fixture
def env(tmp_path):
    log, store, rejects = [], {}, []
    cfg = Config(
        db_url="x", s3_endpoint="", s3_access_key="", s3_secret_key="", mqtt_host="h", mqtt_port=1883,
        mqtt_ingest_password="p", devices={}, lake_bucket="b", hot_retention_days=30, interval_seconds=1,
        heartbeat_path=str(tmp_path / "hb"),
    )
    dbs = []

    def connect_db():
        dbs.append(FakeDb(log, store, rejects))
        return dbs[-1]

    return SimpleNamespace(log=log, store=store, rejects=rejects, cfg=cfg, dbs=dbs, connect_db=connect_db,
                           db=FakeDb(log, store, rejects), hb=tmp_path / "hb")


def test_valid_message_stored(env):
    assert handle_message(env.db, TOPIC, BODY, NOW) == "stored"
    assert len(env.store) == 1 and env.log[0][0] == "insert"


def test_conflict_is_duplicate(env):
    handle_message(env.db, TOPIC, BODY, NOW)
    assert handle_message(env.db, TOPIC, BODY, NOW) == "duplicate"
    assert len(env.store) == 1 and not env.rejects


def test_parcel_of_other_htx_rejected(env):
    topic = "htx/LB/plot/P-TC-001/soil_moisture"
    assert handle_message(env.db, topic, BODY, NOW) == "unknown_parcel"
    assert not env.store
    assert env.rejects[0][2:] == ("unknown_parcel", "LB")


def test_parse_failure_recorded_with_htx_when_known(env):
    assert handle_message(env.db, TOPIC, b"nope", NOW) == "bad_json"
    assert env.rejects[0][2:] == ("bad_json", "TC")
    assert handle_message(env.db, "bad/topic", b"{}", NOW) == "bad_topic"
    assert env.rejects[1][2:] == ("bad_topic", None)


def test_payload_truncated_to_256_bytes(env):
    handle_message(env.db, TOPIC, b"x" * 1000, NOW)
    assert len(env.rejects[0][1]) == 256


def make_worker(env):
    client = FakeClient(env.log)
    return Worker(env.cfg, lambda: client, env.connect_db), client


def test_ack_after_store(env):
    worker, client = make_worker(env)
    worker.on_message(client, None, msg())
    assert [e[0] for e in env.log] == ["insert", "ack"]
    assert env.log.count(("ack", 7, 1)) == 1
    assert env.hb.exists()


def test_rejected_message_is_acked(env):
    worker, client = make_worker(env)
    worker.on_message(client, None, msg(payload=b"nope"))
    assert [e[0] for e in env.log] == ["reject", "ack"]


def test_db_error_does_not_ack(env):
    worker, client = make_worker(env)
    worker.on_message(client, None, msg())  # opens the connection
    env.log.clear()
    env.dbs[0].fail = True
    worker.on_message(client, None, msg(mid=8))
    assert not any(e[0] == "ack" for e in env.log)
    assert client.disconnected and env.dbs[0].closed


def test_redelivery_after_db_error_stores_once(env):
    worker, client = make_worker(env)
    worker.on_message(client, None, msg())
    body = live_body(2)  # one body, so the redelivery has the same key
    env.dbs[0].fail = True
    worker.on_message(client, None, msg(mid=8, payload=body))
    assert len(env.store) == 1  # the failed message left nothing behind
    worker.on_message(client, None, msg(mid=8, payload=body))  # broker redelivery on a fresh connection
    worker.on_message(client, None, msg(mid=8, payload=body))  # and a second redelivery
    assert len(env.dbs) == 2 and len(env.store) == 2
    assert env.log.count(("ack", 8, 1)) == 2  # acked after each success, never after the failure


def test_simulated_values_pass_validation():
    from dxos_dataops.payload import SENSORS, parse_message
    from dxos_dataops.simulate import reading_value

    for hour in range(24):
        ts = datetime(2026, 11, 8, hour, 30, tzinfo=timezone.utc)
        for sensor in SENSORS:
            body = f'{{"ts":"{ts.isoformat()}","value":{reading_value(sensor, ts)}}}'.encode()
            assert parse_message(f"htx/TC/plot/P-TC-001/{sensor}", body, NOW).sensor == sensor
