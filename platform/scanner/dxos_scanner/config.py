# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import os
from dataclasses import dataclass


# Must match clamd StreamMaxLength (CLAMD_CONF_StreamMaxLength=50M in docker-compose.yml).
MAX_SCAN_BYTES = 52428800


@dataclass(frozen=True)
class Config:
    buckets: list[str]
    quarantine_bucket: str
    interval_seconds: float
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    clamd_host: str
    clamd_port: int
    db_url: str
    heartbeat_path: str

    @classmethod
    def from_env(cls) -> "Config":
        env = os.environ
        buckets = env.get("DXOS_SCAN_BUCKETS", "agrimarket-docs,agrimarket-private")
        return cls(
            buckets=[b.strip() for b in buckets.split(",") if b.strip()],
            quarantine_bucket=env.get("DXOS_QUARANTINE_BUCKET", "dxos-quarantine"),
            interval_seconds=float(env.get("DXOS_SCAN_INTERVAL_SECONDS", "5")),
            s3_endpoint=env.get("DXOS_S3_ENDPOINT", "minio:9000"),
            s3_access_key=env["MINIO_ACCESS_KEY"],
            s3_secret_key=env["MINIO_SECRET_KEY"],
            clamd_host=env.get("DXOS_CLAMD_HOST", "clamav"),
            clamd_port=int(env.get("DXOS_CLAMD_PORT", "3310")),
            db_url=env["DXOS_DB_URL"],
            heartbeat_path=env.get("DXOS_HEARTBEAT_PATH", "/tmp/dxos-scanner.heartbeat"),
        )
