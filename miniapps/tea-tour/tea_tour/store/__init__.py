# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Data layer of schema app_tea_tour. Every query filters on htx_code (from the token, or from the URL on public pages).

core holds every booking state change; settings and media hold the rest of the shared tables. Each feature task adds
its own module (site, catalog, sales, guide, guest) next to these.
"""
import psycopg


def connect(url: str) -> psycopg.Connection:
    # Autocommit: each `with conn.transaction()` is the whole transaction, and plain reads take no lock.
    return psycopg.connect(url, autocommit=True, options="-c search_path=app_tea_tour")
