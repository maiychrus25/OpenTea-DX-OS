# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers


def build_quality(rows: list[tuple[str, float]], rejects: dict[str, int]) -> dict:
    """Per-sensor statistics of one partition, plus its rejected messages by reason."""
    values: dict[str, list[float]] = {}
    for sensor, value in rows:
        values.setdefault(sensor, []).append(value)
    return {
        "rows": len(rows),
        "sensors": {s: {"count": len(v), "min": min(v), "max": max(v), "avg": sum(v) / len(v)} for s, v in values.items()},
        "rejects": rejects,
    }
