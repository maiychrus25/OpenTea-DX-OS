# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Bản sao lõi và nội dung HTX trong schema app_tea_experience. Mọi truy vấn lọc theo htx_code (spec §5).

Hàm nhận `htx` là mã HTX đã kiểm: lấy từ token (trang nội bộ) hoặc từ URL (trang công khai). Form không bao giờ
đưa mã HTX vào đây. Mỗi `id` từ URL đều đi kèm htx, nên id của HTX khác cho kết quả rỗng.
"""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

import psycopg
from psycopg.rows import class_row

from tea_experience.core_client import Snapshot


@dataclass(frozen=True)
class Intro:
    htx_code: str
    name: str | None
    address: str | None  # from the core; manager only
    locality_public: str | None  # typed by the manager; the only place shown to guests
    crop_types: str | None
    season_label: str | None
    total_area_ha: Decimal | None
    member_count: int | None
    certification: str | None  # typed by the manager (the core has none)
    intro_text: str | None
    synced_at: datetime | None


@dataclass(frozen=True)
class Site:
    id: UUID
    name: str
    description: str | None
    latitude: Decimal | None
    longitude: Decimal | None
    parcel_code: str | None
    is_public: bool
    sort_order: int


@dataclass(frozen=True)
class Experience:
    id: UUID
    name: str
    description: str | None
    duration_min: int
    price_vnd: int
    months: list[int]
    is_visible: bool
    sort_order: int
    is_featured: bool


@dataclass(frozen=True)
class CoreParcel:
    parcel_code: str
    centroid_lat: Decimal
    centroid_lng: Decimal
    crop: str | None
    season: str | None
    planting: bool


@dataclass(frozen=True)
class SyncRecord:
    synced_at: datetime
    actor: str
    parcels: int
    crops: int
    skipped: int
    result: str
    detail: str | None


@dataclass(frozen=True)
class Overview:
    sites_total: int
    sites_public: int
    experiences_total: int
    experiences_visible: int
    months_with_notes: int


INTRO_COLUMNS = ("htx_code, name, address, locality_public, crop_types, season_label, total_area_ha, member_count, "
                 "certification, intro_text, synced_at")
SITE_COLUMNS = "id, name, description, latitude, longitude, parcel_code, is_public, sort_order"
EXPERIENCE_COLUMNS = "id, name, description, duration_min, price_vnd, months, is_visible, sort_order, is_featured"


def connect(url: str) -> psycopg.Connection:
    # Autocommit: each `with conn.transaction()` below is the whole transaction.
    return psycopg.connect(url, autocommit=True, options="-c search_path=app_tea_experience")


# ---------- Giới thiệu HTX và bản sao lõi ----------

def get_intro(conn: psycopg.Connection, htx: str) -> Intro | None:
    with conn.cursor(row_factory=class_row(Intro)) as cur:
        return cur.execute(f"SELECT {INTRO_COLUMNS} FROM htx_intro WHERE htx_code = %s", (htx,)).fetchone()


def save_intro_fields(conn: psycopg.Connection, htx: str, values: dict) -> None:
    """The manager's own text: introduction, public locality, certification. Never written by a refresh."""
    conn.execute(
        """INSERT INTO htx_intro (htx_code, intro_text, locality_public, certification) VALUES (%s, %s, %s, %s)
           ON CONFLICT (htx_code) DO UPDATE SET intro_text = EXCLUDED.intro_text,
             locality_public = EXCLUDED.locality_public, certification = EXCLUDED.certification,
             updated_at = now()""",
        (htx, values["intro_text"], values["locality_public"], values["certification"]))


def save_snapshot(conn: psycopg.Connection, htx: str, actor: str, snapshot: Snapshot) -> None:
    """Replace the copy of the core in one transaction; the intro text the manager wrote is kept."""
    profile = snapshot.profile
    with conn.transaction():
        conn.execute(
            """INSERT INTO htx_intro (htx_code, name, address, crop_types, season_label, total_area_ha,
                                      member_count, synced_at, updated_at)
               VALUES (%(htx)s, %(name)s, %(address)s, %(crops)s, %(season)s, %(area)s, %(members)s, now(), now())
               ON CONFLICT (htx_code) DO UPDATE SET
                 name = EXCLUDED.name, address = EXCLUDED.address, crop_types = EXCLUDED.crop_types,
                 season_label = EXCLUDED.season_label, total_area_ha = EXCLUDED.total_area_ha,
                 member_count = EXCLUDED.member_count, synced_at = now(), updated_at = now()""",
            {"htx": htx, "name": profile.name, "address": profile.address, "crops": profile.crop_types,
             "season": profile.season_label, "area": profile.total_area_ha, "members": profile.member_count})
        conn.execute("DELETE FROM core_parcels WHERE htx_code = %s", (htx,))
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO core_parcels (htx_code, parcel_code, centroid_lat, centroid_lng, crop, season, planting)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                [(htx, p.parcel_code, p.lat, p.lng, p.crop, p.season, p.planting) for p in snapshot.parcels])
        crops = sum(1 for p in snapshot.parcels if p.planting)
        conn.execute(
            """INSERT INTO core_sync_log (htx_code, actor, parcels, crops, skipped, result)
               VALUES (%s, %s, %s, %s, %s, 'OK')""",
            (htx, actor, len(snapshot.parcels), crops, snapshot.skipped))


def log_sync_failure(conn: psycopg.Connection, htx: str, actor: str, code: str) -> None:
    conn.execute(
        """INSERT INTO core_sync_log (htx_code, actor, result, detail) VALUES (%s, %s, 'ERROR', %s)""",
        (htx, actor, code))


def last_sync(conn: psycopg.Connection, htx: str) -> SyncRecord | None:
    with conn.cursor(row_factory=class_row(SyncRecord)) as cur:
        return cur.execute(
            """SELECT synced_at, actor, parcels, crops, skipped, result, detail FROM core_sync_log
               WHERE htx_code = %s ORDER BY synced_at DESC, id DESC LIMIT 1""", (htx,)).fetchone()


def core_parcels(conn: psycopg.Connection, htx: str) -> list[CoreParcel]:
    with conn.cursor(row_factory=class_row(CoreParcel)) as cur:
        return cur.execute(
            """SELECT parcel_code, centroid_lat, centroid_lng, crop, season, planting FROM core_parcels
               WHERE htx_code = %s ORDER BY parcel_code""", (htx,)).fetchall()


def crop_hint(conn: psycopg.Connection, htx: str) -> list[tuple[str, str | None, int]]:
    """Crops now planted (an open cycle), grouped without parcel codes: (crop, season, number of parcels)."""
    return [tuple(row) for row in conn.execute(
        """SELECT crop, season, count(*)::int FROM core_parcels
           WHERE htx_code = %s AND planting AND crop IS NOT NULL
           GROUP BY crop, season ORDER BY count(*) DESC, crop""",
        (htx,)).fetchall()]


# ---------- Điểm tham quan ----------

def list_sites(conn: psycopg.Connection, htx: str, public_only: bool = False) -> list[Site]:
    where = "AND is_public" if public_only else ""
    with conn.cursor(row_factory=class_row(Site)) as cur:
        return cur.execute(
            f"SELECT {SITE_COLUMNS} FROM sites WHERE htx_code = %s {where} ORDER BY sort_order, name",
            (htx,)).fetchall()


def count_sites(conn: psycopg.Connection, htx: str) -> int:
    return conn.execute("SELECT count(*) FROM sites WHERE htx_code = %s", (htx,)).fetchone()[0]


def get_site(conn: psycopg.Connection, htx: str, site_id: UUID) -> Site | None:
    with conn.cursor(row_factory=class_row(Site)) as cur:
        return cur.execute(f"SELECT {SITE_COLUMNS} FROM sites WHERE htx_code = %s AND id = %s",
                           (htx, site_id)).fetchone()


def create_site(conn: psycopg.Connection, htx: str, values: dict) -> UUID:
    return conn.execute(
        """INSERT INTO sites (htx_code, name, description, latitude, longitude, parcel_code, is_public, sort_order)
           VALUES (%(htx)s, %(name)s, %(description)s, %(latitude)s, %(longitude)s, %(parcel_code)s,
                   %(is_public)s, %(sort_order)s) RETURNING id""",
        {"htx": htx, **values}).fetchone()[0]


def update_site(conn: psycopg.Connection, htx: str, site_id: UUID, values: dict) -> bool:
    return conn.execute(
        """UPDATE sites SET name = %(name)s, description = %(description)s, latitude = %(latitude)s,
                  longitude = %(longitude)s, parcel_code = %(parcel_code)s, is_public = %(is_public)s,
                  sort_order = %(sort_order)s, updated_at = now()
           WHERE htx_code = %(htx)s AND id = %(id)s""",
        {"htx": htx, "id": site_id, **values}).rowcount == 1


def set_site_public(conn: psycopg.Connection, htx: str, site_id: UUID, public: bool) -> bool:
    return conn.execute("UPDATE sites SET is_public = %s, updated_at = now() WHERE htx_code = %s AND id = %s",
                        (public, htx, site_id)).rowcount == 1


def delete_site(conn: psycopg.Connection, htx: str, site_id: UUID) -> bool:
    return conn.execute("DELETE FROM sites WHERE htx_code = %s AND id = %s", (htx, site_id)).rowcount == 1


def known_site_ids(conn: psycopg.Connection, htx: str, ids: list[UUID]) -> set[UUID]:
    return {row[0] for row in conn.execute(
        "SELECT id FROM sites WHERE htx_code = %s AND id = ANY(%s)", (htx, ids)).fetchall()}


# ---------- Gói trải nghiệm ----------

def list_experiences(conn: psycopg.Connection, htx: str, visible_only: bool = False) -> list[Experience]:
    where = "AND is_visible" if visible_only else ""
    with conn.cursor(row_factory=class_row(Experience)) as cur:
        return cur.execute(
            f"SELECT {EXPERIENCE_COLUMNS} FROM experiences WHERE htx_code = %s {where} ORDER BY sort_order, name",
            (htx,)).fetchall()


def count_experiences(conn: psycopg.Connection, htx: str) -> int:
    return conn.execute("SELECT count(*) FROM experiences WHERE htx_code = %s", (htx,)).fetchone()[0]


def get_experience(conn: psycopg.Connection, htx: str, exp_id: UUID, visible_only: bool = False) -> Experience | None:
    where = "AND is_visible" if visible_only else ""
    with conn.cursor(row_factory=class_row(Experience)) as cur:
        return cur.execute(
            f"SELECT {EXPERIENCE_COLUMNS} FROM experiences WHERE htx_code = %s AND id = %s {where}",
            (htx, exp_id)).fetchone()


MAX_FEATURED = 6
FEATURED_FALLBACK = 3  # no gói nổi bật yet: the newest visible ones
SORTS = {"": "sort_order, name", "price": "price_vnd, name", "duration": "duration_min, name"}


def featured_experiences(conn: psycopg.Connection, htx: str) -> list[Experience]:
    """Trang chủ khách: các gói nổi bật đang hiện; chưa có gói nổi bật thì lấy vài gói hiện mới nhất."""
    with conn.cursor(row_factory=class_row(Experience)) as cur:
        rows = cur.execute(
            f"""SELECT {EXPERIENCE_COLUMNS} FROM experiences
                WHERE htx_code = %s AND is_visible AND is_featured
                ORDER BY sort_order, name LIMIT %s""", (htx, MAX_FEATURED)).fetchall()
        if rows:
            return rows
        return cur.execute(
            f"""SELECT {EXPERIENCE_COLUMNS} FROM experiences WHERE htx_code = %s AND is_visible
                ORDER BY created_at DESC, name LIMIT %s""", (htx, FEATURED_FALLBACK)).fetchall()


def count_featured(conn: psycopg.Connection, htx: str, exclude: UUID | None = None) -> int:
    return conn.execute(
        "SELECT count(*) FROM experiences WHERE htx_code = %s AND is_featured AND id IS DISTINCT FROM %s",
        (htx, exclude)).fetchone()[0]


def set_experience_featured(conn: psycopg.Connection, htx: str, exp_id: UUID, featured: bool) -> bool:
    return conn.execute(
        "UPDATE experiences SET is_featured = %s, updated_at = now() WHERE htx_code = %s AND id = %s",
        (featured, htx, exp_id)).rowcount == 1


def _like_escape(text: str) -> str:
    return text.replace("!", "!!").replace("%", "!%").replace("_", "!_")


def search_public_experiences(conn: psycopg.Connection, htx: str, month: int | None = None, q: str | None = None,
                              max_price: int | None = None, sort: str = "") -> list[Experience]:
    """Gói đang hiện, lọc theo tháng, tên và giá tối đa. Mọi giá trị là tham số; sort chỉ nhận khoá của SORTS."""
    clauses, params = ["htx_code = %(htx)s", "is_visible"], {"htx": htx}
    if month is not None:
        clauses.append("%(month)s = ANY(months)")
        params["month"] = month
    if q:
        clauses.append("name ILIKE %(q)s ESCAPE '!'")
        params["q"] = f"%{_like_escape(q)}%"
    if max_price is not None:
        clauses.append("price_vnd <= %(max_price)s")
        params["max_price"] = max_price
    order = SORTS[sort]  # a whitelist: no user text reaches the SQL
    with conn.cursor(row_factory=class_row(Experience)) as cur:
        return cur.execute(
            f"SELECT {EXPERIENCE_COLUMNS} FROM experiences WHERE {' AND '.join(clauses)} ORDER BY {order}",
            params).fetchall()


def linked_site_ids(conn: psycopg.Connection, htx: str, exp_id: UUID) -> list[UUID]:
    return [row[0] for row in conn.execute(
        "SELECT site_id FROM experience_sites WHERE htx_code = %s AND experience_id = %s", (htx, exp_id)).fetchall()]


def public_site_names(conn: psycopg.Connection, htx: str) -> dict[UUID, list[str]]:
    """Names of the public points linked to each visible experience. Names only: no coordinates, no parcels."""
    names: dict[UUID, list[str]] = {}
    rows = conn.execute(
        """SELECT l.experience_id, s.name FROM experience_sites l
           JOIN sites s ON s.id = l.site_id AND s.htx_code = l.htx_code
           JOIN experiences e ON e.id = l.experience_id AND e.htx_code = l.htx_code
           WHERE l.htx_code = %s AND s.is_public AND e.is_visible
           ORDER BY s.sort_order, s.name""", (htx,)).fetchall()
    for exp_id, name in rows:
        names.setdefault(exp_id, []).append(name)
    return names


def linked_sites(conn: psycopg.Connection, htx: str, exp_id: UUID, public_only: bool = False) -> list[Site]:
    where = "AND s.is_public" if public_only else ""
    with conn.cursor(row_factory=class_row(Site)) as cur:
        return cur.execute(
            f"""SELECT s.id, s.name, s.description, s.latitude, s.longitude, s.parcel_code, s.is_public, s.sort_order
                FROM experience_sites l JOIN sites s ON s.id = l.site_id AND s.htx_code = l.htx_code
                WHERE l.htx_code = %s AND l.experience_id = %s {where} ORDER BY s.sort_order, s.name""",
            (htx, exp_id)).fetchall()


def create_experience(conn: psycopg.Connection, htx: str, values: dict, site_ids: list[UUID]) -> UUID:
    with conn.transaction():
        exp_id = conn.execute(
            """INSERT INTO experiences (htx_code, name, description, duration_min, price_vnd, months, is_visible,
                                        sort_order, is_featured)
               VALUES (%(htx)s, %(name)s, %(description)s, %(duration_min)s, %(price_vnd)s, %(months)s::int[],
                       %(is_visible)s, %(sort_order)s, %(is_featured)s) RETURNING id""",
            {"htx": htx, **values}).fetchone()[0]
        _link(conn, htx, exp_id, site_ids)
    return exp_id


def update_experience(conn: psycopg.Connection, htx: str, exp_id: UUID, values: dict, site_ids: list[UUID]) -> bool:
    with conn.transaction():
        found = conn.execute(
            """UPDATE experiences SET name = %(name)s, description = %(description)s,
                      duration_min = %(duration_min)s, price_vnd = %(price_vnd)s, months = %(months)s::int[],
                      is_visible = %(is_visible)s, sort_order = %(sort_order)s, is_featured = %(is_featured)s,
                      updated_at = now()
               WHERE htx_code = %(htx)s AND id = %(id)s""",
            {"htx": htx, "id": exp_id, **values}).rowcount == 1
        if not found:
            return False
        conn.execute("DELETE FROM experience_sites WHERE htx_code = %s AND experience_id = %s", (htx, exp_id))
        _link(conn, htx, exp_id, site_ids)
    return True


def _link(conn: psycopg.Connection, htx: str, exp_id: UUID, site_ids: list[UUID]) -> None:
    # The composite foreign key also refuses a site of another HTX; the caller checks first for a Vietnamese message.
    for site_id in site_ids:
        conn.execute("INSERT INTO experience_sites (htx_code, experience_id, site_id) VALUES (%s, %s, %s)",
                     (htx, exp_id, site_id))


def set_experience_visible(conn: psycopg.Connection, htx: str, exp_id: UUID, visible: bool) -> bool:
    return conn.execute("UPDATE experiences SET is_visible = %s, updated_at = now() WHERE htx_code = %s AND id = %s",
                        (visible, htx, exp_id)).rowcount == 1


def delete_experience(conn: psycopg.Connection, htx: str, exp_id: UUID) -> bool:
    return conn.execute("DELETE FROM experiences WHERE htx_code = %s AND id = %s", (htx, exp_id)).rowcount == 1


# ---------- Mùa vụ ----------

def season_notes(conn: psycopg.Connection, htx: str) -> dict[int, str]:
    return {row[0]: row[1] for row in conn.execute(
        "SELECT month_no, note FROM season_notes WHERE htx_code = %s", (htx,)).fetchall()}


def save_season_notes(conn: psycopg.Connection, htx: str, notes: dict[int, str | None]) -> None:
    """notes maps every month 1..12 to its text, or None/empty to clear it."""
    with conn.transaction():
        for month, note in notes.items():
            if note:
                conn.execute(
                    """INSERT INTO season_notes (htx_code, month_no, note) VALUES (%s, %s, %s)
                       ON CONFLICT (htx_code, month_no) DO UPDATE SET note = EXCLUDED.note, updated_at = now()""",
                    (htx, month, note))
            else:
                conn.execute("DELETE FROM season_notes WHERE htx_code = %s AND month_no = %s", (htx, month))


# ---------- Tổng quan ----------

def overview(conn: psycopg.Connection, htx: str) -> Overview:
    row = conn.execute(
        """SELECT (SELECT count(*) FROM sites WHERE htx_code = %(h)s),
                  (SELECT count(*) FROM sites WHERE htx_code = %(h)s AND is_public),
                  (SELECT count(*) FROM experiences WHERE htx_code = %(h)s),
                  (SELECT count(*) FROM experiences WHERE htx_code = %(h)s AND is_visible),
                  (SELECT count(*) FROM season_notes WHERE htx_code = %(h)s)""", {"h": htx}).fetchone()
    return Overview(*[int(v) for v in row])
