# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    db_url: str
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    mqtt_host: str
    mqtt_port: int
    mqtt_ingest_password: str
    devices: dict[str, str]  # htx_code -> device password
    lake_bucket: str
    hot_retention_days: int
    interval_seconds: float
    heartbeat_path: str

    @classmethod
    def from_env(cls) -> "Config":
        env = os.environ
        # Only DXOS_DB_URL is required here; each command checks the credentials it uses.
        devices = {}
        for entry in env.get("DXOS_MQTT_DEVICES", "").split(","):
            if entry.strip():
                htx, _, password = entry.strip().partition(":")
                devices[htx] = password
        return cls(
            db_url=env["DXOS_DB_URL"],
            s3_endpoint=env.get("DXOS_S3_ENDPOINT", "minio:9000"),
            s3_access_key=env.get("MINIO_ACCESS_KEY", ""),
            s3_secret_key=env.get("MINIO_SECRET_KEY", ""),
            mqtt_host=env.get("DXOS_MQTT_HOST", "mosquitto"),
            mqtt_port=int(env.get("DXOS_MQTT_PORT", "1883")),
            mqtt_ingest_password=env.get("DXOS_MQTT_INGEST_PASSWORD", ""),
            devices=devices,
            lake_bucket=env.get("DXOS_LAKE_BUCKET", "dxos-lake"),
            hot_retention_days=int(env.get("DXOS_HOT_RETENTION_DAYS", "30")),
            interval_seconds=float(env.get("DXOS_LIFECYCLE_INTERVAL_SECONDS", "3600")),
            heartbeat_path=env.get("DXOS_HEARTBEAT_PATH", "/tmp/dxos-dataops.heartbeat"),
        )
