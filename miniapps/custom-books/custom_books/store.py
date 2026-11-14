# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Sổ và dòng trong schema app_custom_books. Every statement filters on htx_code from the token.

Field labels and option texts never reach SQL. Only a server-made field key (checked against KEY_RE) is put into a
JSON path, and every value is a parameter."""
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from custom_books.book_templates import BLANK, TEMPLATES
from custom_books.appkit import like_pattern
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


# ---------- records ----------

RECORD_STATUSES = ("PENDING", "APPROVED", "REJECTED")
MAX_EXPORT = 5000  # rows of one CSV or print page


@dataclass(frozen=True)
class Record:
    id: UUID
    data: dict
    entry_date: date
    household_id: str | None
    household_name: str | None
    status: str
    reject_reason: str | None
    decided_by_name: str | None
    created_by: str
    created_by_name: str
    created_at: datetime


@dataclass(frozen=True)
class Filters:
    q: str = ""
    start: date | None = None
    end: date | None = None
    choices: tuple[tuple[str, str], ...] = ()  # (field key, option)
    household: str = ""
    status: str = ""


RECORD_COLUMNS = """r.id, r.data, r.entry_date, r.household_id, r.household_name, r.status, r.reject_reason, r.decided_by_name,
  r.created_by, r.created_by_name, r.created_at"""
_ESCAPE = r"ESCAPE '\'"


def _where(htx: str, book: Book, owner: str | None, flt: Filters, counted_only: bool = False) -> tuple[str, list]:
    """The WHERE clause of every record read. owner: the author's id for a caller at level 'own', else None.
    Keys travel as parameters (`data ->> %s::text`); the SQL text is fixed."""
    clauses, params = ["r.htx_code = %s", "r.book_id = %s"], [htx, book.id]
    if owner is not None:
        clauses.append("r.created_by = %s")
        params.append(owner)
    if counted_only and book.approval:
        clauses.append("r.status = 'APPROVED'")
    if flt.q:
        pattern = like_pattern(flt.q)
        parts = [f"r.created_by_name ILIKE %s {_ESCAPE}"]
        params.append(pattern)
        for f in book.fields:
            if f.type in ("text", "long_text"):
                parts.append(f"r.data ->> %s::text ILIKE %s {_ESCAPE}")
                params += [json_path_key(f.key), pattern]
        clauses.append("(" + " OR ".join(parts) + ")")
    if flt.start:
        clauses.append("r.entry_date >= %s")
        params.append(flt.start)
    if flt.end:
        clauses.append("r.entry_date <= %s")
        params.append(flt.end)
    for key, option in flt.choices:
        clauses.append("r.data ->> %s::text = %s")
        params += [json_path_key(key), option]
    if flt.household:
        clauses.append("r.household_id = %s")
        params.append(flt.household)
    if flt.status in RECORD_STATUSES:
        clauses.append("r.status = %s")
        params.append(flt.status)
    return " AND ".join(clauses), params


def count_records(conn, htx: str, book: Book, owner: str | None, flt: Filters = Filters()) -> int:
    where, params = _where(htx, book, owner, flt)
    return conn.execute(f"SELECT count(*) FROM records r WHERE {where}", params).fetchone()[0]


def list_records(conn, htx: str, book: Book, owner: str | None, flt: Filters, limit: int, offset: int = 0) -> list[Record]:
    where, params = _where(htx, book, owner, flt)
    rows = conn.execute(f"""SELECT {RECORD_COLUMNS} FROM records r WHERE {where}
                            ORDER BY r.entry_date DESC, r.created_at DESC, r.id LIMIT %s OFFSET %s""",
                        params + [limit, offset]).fetchall()
    return [Record(*r) for r in rows]


def get_record(conn, htx: str, book_id: UUID, record_id: UUID) -> Record | None:
    row = conn.execute(f"SELECT {RECORD_COLUMNS} FROM records r WHERE r.htx_code = %s AND r.book_id = %s AND r.id = %s",
                       (htx, book_id, record_id)).fetchone()
    return Record(*row) if row else None


def insert_record(conn, htx: str, book_id: UUID, user: str, user_name: str, data: dict, entry_date: date,
                  household_id: str | None, household_name: str | None, status: str) -> UUID:
    return conn.execute(
        """INSERT INTO records (htx_code, book_id, data, entry_date, household_id, household_name, status, created_by,
                                created_by_name) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (htx, book_id, Jsonb(data), entry_date, household_id, household_name, status, user, user_name)).fetchone()[0]


def update_record(conn, htx: str, book_id: UUID, record_id: UUID, data: dict, entry_date: date,
                  household_id: str | None, household_name: str | None, status: str, owner: str | None,
                  locked: tuple[str, ...]) -> bool:
    """owner: only that author's row (None = any); locked: statuses that may not be changed (the check is in the
    statement, so a row approved a moment ago cannot be overwritten)."""
    return conn.execute(
        """UPDATE records SET data = %s, entry_date = %s, household_id = %s, household_name = %s, status = %s,
               updated_at = now(),
               reject_reason = CASE WHEN %s = 'PENDING' THEN NULL ELSE reject_reason END,
               decided_by_name = CASE WHEN %s = 'PENDING' THEN NULL ELSE decided_by_name END,
               decided_at = CASE WHEN %s = 'PENDING' THEN NULL ELSE decided_at END
           WHERE htx_code = %s AND book_id = %s AND id = %s AND (%s::text IS NULL OR created_by = %s)
             AND NOT (status = ANY(%s))""",
        (Jsonb(data), entry_date, household_id, household_name, status, status, status, status, htx, book_id, record_id, owner, owner,
         list(locked))).rowcount == 1


def delete_record(conn, htx: str, book_id: UUID, record_id: UUID, owner: str | None, locked: tuple[str, ...]) -> bool:
    return conn.execute(
        """DELETE FROM records WHERE htx_code = %s AND book_id = %s AND id = %s
             AND (%s::text IS NULL OR created_by = %s) AND NOT (status = ANY(%s))""",
        (htx, book_id, record_id, owner, owner, list(locked))).rowcount == 1


def decide(conn, htx: str, book_id: UUID, record_id: UUID, status: str, reason: str | None, name: str,
           from_statuses: tuple[str, ...]) -> bool:
    return conn.execute(
        """UPDATE records SET status = %s, reject_reason = %s, decided_by_name = %s, decided_at = now(), updated_at = now()
           WHERE htx_code = %s AND book_id = %s AND id = %s AND status = ANY(%s)""",
        (status, reason, name, htx, book_id, record_id, list(from_statuses))).rowcount == 1


def sums(conn, htx: str, book: Book, owner: str | None, flt: Filters = Filters(), counted_only: bool = True,
         since: date | None = None, until: date | None = None) -> tuple[int, dict[str, Decimal]]:
    """Number of rows and the total of every summary field, over the rows that count (approved ones when the book
    needs approval), optionally within [since, until)."""
    keys = [json_path_key(f.key) for f in book.fields if f.summary]
    where, params = _where(htx, book, owner, flt, counted_only)
    if since:
        where += " AND r.entry_date >= %s AND r.entry_date < %s"
        params += [since, until]
    select = ", ".join(["count(*)"] + ["sum((r.data ->> %s::text)::numeric)"] * len(keys))
    row = conn.execute(f"SELECT {select} FROM records r WHERE {where}", keys + params).fetchone()
    return row[0], {k: row[i] or Decimal(0) for i, k in enumerate(keys, 1)}


def monthly(conn, htx: str, book: Book, owner: str | None, key: str | None, first_month: date) -> dict[date, Decimal]:
    """Per month from first_month on: the total of a summary field, or the number of rows when key is None."""
    where, params = _where(htx, book, owner, Filters(), True)
    value = "count(*)" if key is None else "sum((r.data ->> %s::text)::numeric)"
    rows = conn.execute(
        f"""SELECT date_trunc('month', r.entry_date)::date, {value} FROM records r
            WHERE {where} AND r.entry_date >= %s GROUP BY 1""",
        ([] if key is None else [json_path_key(key)]) + params + [first_month]).fetchall()
    return {month: Decimal(total or 0) for month, total in rows}


def by_option(conn, htx: str, book: Book, owner: str | None, key: str) -> dict[str, int]:
    where, params = _where(htx, book, owner, Filters(), True)
    rows = conn.execute(f"SELECT r.data ->> %s::text, count(*) FROM records r WHERE {where} GROUP BY 1",
                        [json_path_key(key)] + params).fetchall()
    return {value: n for value, n in rows if value is not None}
