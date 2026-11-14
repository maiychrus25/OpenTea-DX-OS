# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Sổ và dòng trong schema app_custom_books. Every statement filters on htx_code from the token.

Field labels and option texts never reach SQL. Only a server-made field key (checked against KEY_RE) is put into a
JSON path, and every value is a parameter."""
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from custom_books.book_templates import BLANK, TEMPLATES
from custom_books.fields import KEY_RE, MAX_BOOKS, Field

STATUSES = ("DRAFT", "PUBLISHED", "ARCHIVED")


@dataclass(frozen=True)
class Book:
    id: UUID
    name: str
    description: str
    icon: str
    fields: tuple[Field, ...]
    next_key: int
    officer_access: str
    farmer_access: str
    approval: bool
    status: str
    created_at: datetime
    updated_at: datetime
    record_count: int = 0


BOOK_COLUMNS = """b.id, b.name, b.description, b.icon, b.fields, b.next_key, b.officer_access, b.farmer_access,
  b.approval, b.status, b.created_at, b.updated_at,
  (SELECT count(*) FROM records r WHERE r.book_id = b.id AND r.htx_code = b.htx_code)"""


def _book(row) -> Book:
    fields = tuple(Field.from_json(f) for f in row[4])
    return Book(*row[:4], fields, *row[5:])


def connect(url: str) -> psycopg.Connection:
    # Autocommit: each `with conn.transaction()` is the whole transaction, and reads take no lock.
    return psycopg.connect(url, autocommit=True, options="-c search_path=app_custom_books")


def json_path_key(key: str) -> str:
    """The only text that may be placed in a JSON path: a key the server made."""
    if not KEY_RE.fullmatch(key):
        raise ValueError("not a field key")
    return key


# ---------- books ----------

def create_book(conn, htx: str, user: str, template_key: str) -> UUID | None:
    """A new DRAFT book from a template (or 'blank'); None when the HTX already has MAX_BOOKS books."""
    template = BLANK if template_key == "blank" else TEMPLATES[template_key]
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (htx,))  # two creates cannot both pass the limit
        if conn.execute("SELECT count(*) FROM books WHERE htx_code = %s", (htx,)).fetchone()[0] >= MAX_BOOKS:
            return None
        return conn.execute(
            """INSERT INTO books (htx_code, name, description, icon, fields, next_key, officer_access, farmer_access,
                                  approval, created_by) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (htx, template.name, template.description, template.icon, Jsonb([f.to_json() for f in template.fields]),
             template.next_key, template.officer_access, template.farmer_access, template.approval, user)).fetchone()[0]


def get_book(conn, htx: str, book_id: UUID, lock: bool = False) -> Book | None:
    """lock=True (inside a transaction) also blocks a record insert, which takes a share lock on its book."""
    row = conn.execute(f"SELECT {BOOK_COLUMNS} FROM books b WHERE b.htx_code = %s AND b.id = %s"
                       + (" FOR UPDATE OF b" if lock else ""), (htx, book_id)).fetchone()
    return _book(row) if row else None


def list_books(conn, htx: str, status: str | None = None) -> list[Book]:
    rows = conn.execute(
        f"""SELECT {BOOK_COLUMNS} FROM books b WHERE b.htx_code = %s AND (%s::text IS NULL OR b.status = %s)
            ORDER BY b.updated_at DESC, b.id""", (htx, status, status)).fetchall()
    return [_book(r) for r in rows]


def save_design(conn, htx: str, book_id: UUID, settings: dict, fields, next_key: int) -> bool:
    return conn.execute(
        """UPDATE books SET name = %s, description = %s, icon = %s, officer_access = %s, farmer_access = %s,
                  approval = %s, fields = %s, next_key = %s, updated_at = now()
           WHERE htx_code = %s AND id = %s""",
        (settings["name"], settings["description"], settings["icon"], settings["officer_access"],
         settings["farmer_access"], settings["approval"], Jsonb([f.to_json() for f in fields]), next_key,
         htx, book_id)).rowcount == 1


def set_status(conn, htx: str, book_id: UUID, to: str, from_statuses: tuple[str, ...]) -> bool:
    """Move a book between DRAFT, PUBLISHED and ARCHIVED; publishing needs at least one field."""
    return conn.execute(
        """UPDATE books SET status = %s, updated_at = now() WHERE htx_code = %s AND id = %s AND status = ANY(%s)
           AND (%s <> 'PUBLISHED' OR jsonb_array_length(fields) > 0)""",
        (to, htx, book_id, list(from_statuses), to)).rowcount == 1


def delete_book(conn, htx: str, book_id: UUID) -> str:
    """'deleted', 'missing' or 'has_records'."""
    with conn.transaction():
        row = conn.execute("SELECT id FROM books WHERE htx_code = %s AND id = %s FOR UPDATE", (htx, book_id)).fetchone()
        if row is None:
            return "missing"
        if conn.execute("SELECT 1 FROM records WHERE htx_code = %s AND book_id = %s LIMIT 1", (htx, book_id)).fetchone():
            return "has_records"
        conn.execute("DELETE FROM books WHERE htx_code = %s AND id = %s", (htx, book_id))
        return "deleted"
