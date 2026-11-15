# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Photo rows (spec 7.7): at most 12 per tour and 200 per cooperative; public only for a PUBLISHED tour or the site cover."""
from dataclasses import dataclass
from enum import Enum
from uuid import UUID

from tea_tour.media import ProcessedImage

TOUR_LIMIT = 12
HTX_LIMIT = 200
VARIANTS = {"large": "large", "thumb": "thumb"}  # the only column names that ever reach the SQL text


class MediaRefusal(Enum):
    TOUR_FULL = "Mỗi tour tối đa 12 ảnh. Hãy xoá bớt một ảnh trước khi tải thêm."
    HTX_FULL = "HTX đã dùng hết 200 ảnh. Hãy xoá bớt ảnh không dùng nữa."
    NOT_FOUND = "Không tìm thấy tour."

    @property
    def message(self) -> str:
        return self.value


@dataclass(frozen=True)
class MediaRef:
    id: UUID
    position: int
    width: int
    height: int


def count_for_htx(conn, htx_code: str) -> int:
    return conn.execute("SELECT count(*) FROM media WHERE htx_code = %s", (htx_code,)).fetchone()[0]


def _insert(conn, htx_code: str, image: ProcessedImage, created_by: str) -> UUID:
    return conn.execute(
        "INSERT INTO media (htx_code, width, height, large, thumb, created_by) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
        (htx_code, image.width, image.height, image.large, image.thumb, created_by[:80])).fetchone()[0]


def _lock_quota(conn, htx_code: str) -> None:
    conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("tea-tour-media:" + htx_code,))


def add_tour_photo(conn, htx_code: str, tour_id: UUID, image: ProcessedImage, created_by: str) -> UUID | MediaRefusal:
    """Store and attach one processed photo at the end of the tour's gallery; the first one becomes the cover."""
    with conn.transaction():
        tour = conn.execute("SELECT cover_media_id FROM tours WHERE id = %s AND htx_code = %s FOR UPDATE",
                            (tour_id, htx_code)).fetchone()
        if tour is None:
            return MediaRefusal.NOT_FOUND
        _lock_quota(conn, htx_code)
        count, next_position = conn.execute(
            "SELECT count(*), COALESCE(max(position) + 1, 0) FROM tour_media WHERE tour_id = %s AND htx_code = %s",
            (tour_id, htx_code)).fetchone()
        if count >= TOUR_LIMIT:
            return MediaRefusal.TOUR_FULL
        if count_for_htx(conn, htx_code) >= HTX_LIMIT:
            return MediaRefusal.HTX_FULL
        media_id = _insert(conn, htx_code, image, created_by)
        conn.execute("INSERT INTO tour_media (htx_code, tour_id, media_id, position) VALUES (%s, %s, %s, %s)",
                     (htx_code, tour_id, media_id, next_position))
        if tour[0] is None:
            conn.execute("UPDATE tours SET cover_media_id = %s, updated_at = now() WHERE id = %s AND htx_code = %s",
                         (media_id, tour_id, htx_code))
        return media_id


def add_site_cover(conn, htx_code: str, image: ProcessedImage, created_by: str) -> UUID | MediaRefusal:
    """Set the cooperative's cover image (settings.cover_media_id), deleting the one it replaces."""
    with conn.transaction():
        _lock_quota(conn, htx_code)
        old = conn.execute("SELECT cover_media_id FROM settings WHERE htx_code = %s", (htx_code,)).fetchone()
        if count_for_htx(conn, htx_code) >= HTX_LIMIT + (1 if old and old[0] else 0):
            return MediaRefusal.HTX_FULL
        media_id = _insert(conn, htx_code, image, created_by)
        conn.execute("INSERT INTO settings (htx_code, cover_media_id) VALUES (%s, %s) "
                     "ON CONFLICT (htx_code) DO UPDATE SET cover_media_id = EXCLUDED.cover_media_id", (htx_code, media_id))
        if old and old[0]:
            conn.execute("DELETE FROM media WHERE id = %s AND htx_code = %s", (old[0], htx_code))
        return media_id


def list_tour_media(conn, htx_code: str, tour_id: UUID) -> list[MediaRef]:
    rows = conn.execute(
        "SELECT m.id, tm.position, m.width, m.height FROM tour_media tm "
        "JOIN media m ON m.id = tm.media_id AND m.htx_code = tm.htx_code "
        "WHERE tm.htx_code = %s AND tm.tour_id = %s ORDER BY tm.position", (htx_code, tour_id)).fetchall()
    return [MediaRef(*row) for row in rows]


def set_tour_cover(conn, htx_code: str, tour_id: UUID, media_id: UUID) -> bool:
    with conn.transaction():
        found = conn.execute("SELECT 1 FROM tour_media WHERE htx_code = %s AND tour_id = %s AND media_id = %s",
                             (htx_code, tour_id, media_id)).fetchone()
        if found is None:
            return False
        conn.execute("UPDATE tours SET cover_media_id = %s, updated_at = now() WHERE id = %s AND htx_code = %s",
                     (media_id, tour_id, htx_code))
        return True


def move(conn, htx_code: str, tour_id: UUID, media_id: UUID, direction: str) -> bool:
    """Swap with the neighbour above ("up") or below ("down"); False at the ends or for an unknown photo."""
    if direction not in ("up", "down"):
        return False
    with conn.transaction():
        conn.execute("SELECT 1 FROM tours WHERE id = %s AND htx_code = %s FOR UPDATE", (tour_id, htx_code))
        ids = [m.id for m in list_tour_media(conn, htx_code, tour_id)]
        if media_id not in ids:
            return False
        i = ids.index(media_id)
        j = i - 1 if direction == "up" else i + 1
        if not 0 <= j < len(ids):
            return False
        ids[i], ids[j] = ids[j], ids[i]
        _renumber(conn, htx_code, tour_id, ids)
        return True


def _renumber(conn, htx_code: str, tour_id: UUID, ids: list[UUID]) -> None:
    for position, media_id in enumerate(ids):
        conn.execute("UPDATE tour_media SET position = %s WHERE htx_code = %s AND tour_id = %s AND media_id = %s",
                     (position, htx_code, tour_id, media_id))


def remove(conn, htx_code: str, tour_id: UUID, media_id: UUID) -> bool:
    """Delete one photo of the tour; if it was the cover, the first remaining photo (or none) takes over."""
    with conn.transaction():
        conn.execute("SELECT 1 FROM tours WHERE id = %s AND htx_code = %s FOR UPDATE", (tour_id, htx_code))
        ids = [m.id for m in list_tour_media(conn, htx_code, tour_id)]
        if media_id not in ids:
            return False
        rest = [i for i in ids if i != media_id]
        conn.execute("UPDATE tours SET cover_media_id = %s, updated_at = now() "
                     "WHERE id = %s AND htx_code = %s AND cover_media_id = %s",
                     (rest[0] if rest else None, tour_id, htx_code, media_id))
        conn.execute("DELETE FROM tour_media WHERE htx_code = %s AND tour_id = %s AND media_id = %s",
                     (htx_code, tour_id, media_id))
        conn.execute("DELETE FROM media WHERE id = %s AND htx_code = %s", (media_id, htx_code))
        _renumber(conn, htx_code, tour_id, rest)
        return True


def get_image(conn, htx_code: str, media_id: UUID, variant: str, public: bool) -> bytes | None:
    """The JPEG bytes. public=True serves only a photo of a PUBLISHED tour or the cooperative's cover image."""
    column = VARIANTS.get(variant)
    if column is None:
        return None
    visible = (" AND (EXISTS (SELECT 1 FROM tour_media tm JOIN tours t ON t.id = tm.tour_id AND t.htx_code = tm.htx_code "
               "WHERE tm.media_id = m.id AND tm.htx_code = m.htx_code AND t.status = 'PUBLISHED') "
               "OR EXISTS (SELECT 1 FROM settings s WHERE s.htx_code = m.htx_code AND s.cover_media_id = m.id))"
               if public else "")
    row = conn.execute(f"SELECT m.{column} FROM media m WHERE m.id = %s AND m.htx_code = %s{visible}",
                       (media_id, htx_code)).fetchone()
    return bytes(row[0]) if row else None
