# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import json
import logging
import math
import random
import threading
from datetime import datetime, timedelta, timezone

import paho.mqtt.client as mqtt

from .config import Config
from .payload import SENSORS

log = logging.getLogger("dxos_simulate")

# sensor -> (daily midpoint, daily swing); values are clamped to the valid range in payload.SENSORS.
PROFILE = {
    "soil_moisture": (45, 15),
    "soil_temperature": (24, 6),
    "air_temperature": (27, 7),
    "air_humidity": (70, 20),
    "rainfall": (2, 2),
}
PARCELS_SQL = """
SELECT x.htx_code, p.parcel_code FROM public.parcels p
JOIN public.households h ON h.id = p.household_id
JOIN public.htx_profiles x ON x.id = h.htx_profile_id
WHERE x.htx_code = ANY(%s) ORDER BY 1, 2"""


def reading_value(sensor: str, ts: datetime) -> float:
    mid, swing = PROFILE[sensor]
    lo, hi = SENSORS[sensor]
    day_phase = (ts.hour + ts.minute / 60) / 24 * 2 * math.pi
    value = mid + swing * math.sin(day_phase) + random.uniform(-swing / 4, swing / 4)
    return round(min(hi, max(lo, value)), 1)


def publish_all(clients, parcels, ts: datetime) -> None:
    for htx, parcel in parcels:
        for sensor in SENSORS:
            body = json.dumps({"ts": ts.strftime("%Y-%m-%dT%H:%M:%SZ"), "value": reading_value(sensor, ts)})
            info = clients[htx].publish(f"htx/{htx}/plot/{parcel}/{sensor}", body, qos=1)
            info.wait_for_publish(timeout=10)
            if not info.is_published():  # wait_for_publish returns normally on timeout
                raise RuntimeError(f"publish to htx/{htx}/plot/{parcel}/{sensor} not completed")


def run(cfg: Config, connect_db, stop: threading.Event, backfill_days: int | None = None, step_minutes: int = 60) -> None:
    htxs = sorted(cfg.devices)
    if not htxs:
        raise SystemExit("DXOS_MQTT_DEVICES is empty")
    with connect_db() as db:
        parcels = [tuple(r) for r in db.execute(PARCELS_SQL, (htxs,)).fetchall()]
    clients = {}
    for htx in htxs:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311)
        client.username_pw_set(htx, cfg.devices[htx])
        client.connect(cfg.mqtt_host, cfg.mqtt_port, keepalive=30)
        client.loop_start()
        clients[htx] = client
    try:
        if backfill_days is not None:
            now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
            ts, end = now - timedelta(days=backfill_days), now - timedelta(days=1)
            while ts <= end and not stop.is_set():
                publish_all(clients, parcels, ts)
                ts += timedelta(minutes=step_minutes)
            log.info("backfill done for %d parcels", len(parcels))
            return
        while not stop.is_set():
            publish_all(clients, parcels, datetime.now(timezone.utc))
            stop.wait(60)
    finally:
        for client in clients.values():
            client.disconnect()
            client.loop_stop()
