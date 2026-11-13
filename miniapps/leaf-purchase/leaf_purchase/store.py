# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Phiếu cân, loại chè, kỳ và chi trả trong schema app_leaf_purchase. Mọi truy vấn lọc theo htx_code lấy từ token."""
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

import psycopg
from psycopg.rows import class_row

KG_RE = re.compile(r"[0-9]{1,4}(?:[.,][0-9])?")  # ASCII digits, at most one decimal: kg is numeric(7,1)
MAX_KG = Decimal(5000)


@dataclass(frozen=True)
class Grade:
    id: UUID
    name: str
    price_vnd: int
    active: bool


@dataclass(frozen=True)
class Ticket:
    id: UUID
    household_id: str
    household_name: str
    weighed_on: date
    grade_id: UUID
    grade_name: str
    kg: Decimal
    price_vnd: int
    amount_vnd: int
    voided: bool
    period_id: UUID | None

    @property
    def open(self) -> bool:
        return not self.voided and self.period_id is None


@dataclass(frozen=True)
class Period:
    id: UUID
    date_from: date
    date_to: date
    closed_at: datetime
    households: int
    paid: int
    total_vnd: int


@dataclass(frozen=True)
class Payout:
    id: UUID
    household_id: str
    household_name: str
    total_kg: Decimal
    total_vnd: int
    paid_at: datetime | None


class TicketRefusal(Enum):
    NOT_FOUND = "Không tìm thấy phiếu cân hoặc loại chè."
    CLOSED = "Phiếu đã vào kỳ đã chốt hoặc đã huỷ nên không sửa được."
    CLOSED_RANGE = "Ngày cân này thuộc một kỳ đã chốt."

    @property
    def message(self) -> str:
        return self.value


class PeriodRefusal(Enum):
    OVERLAP = "Kỳ này trùng ngày với một kỳ đã chốt."
    EMPTY = "Không có phiếu cân nào trong khoảng này."

    @property
    def message(self) -> str:
        return self.value


TICKET_COLUMNS = ("id, household_id, household_name, weighed_on, grade_id, grade_name, kg, price_vnd, amount_vnd, "
                  "voided, period_id")


def connect(url: str) -> psycopg.Connection:
    # Autocommit: each `with conn.transaction()` below is the whole transaction, and reads take no lock.
    return psycopg.connect(url, autocommit=True, options="-c search_path=app_leaf_purchase")


def parse_kg(raw: str) -> Decimal | None:
    text = raw.strip()
    if not KG_RE.fullmatch(text):
        return None
    kg = Decimal(text.replace(",", "."))
    return kg if 0 < kg <= MAX_KG else None


def _lock_htx(conn, htx_code: str) -> None:
    """One lock per HTX serialises closing a period with writing or editing tickets, so no ticket slips past a close."""
    conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (htx_code,))


def _in_closed_range(conn, htx_code: str, day: date) -> bool:
    return conn.execute("SELECT 1 FROM periods WHERE htx_code = %s AND date_from <= %s AND date_to >= %s",
                        (htx_code, day, day)).fetchone() is not None


# ---------- Grades ----------

def list_grades(conn, htx_code: str, active_only: bool = False) -> list[Grade]:
    with conn.cursor(row_factory=class_row(Grade)) as cur:
        return cur.execute("SELECT id, name, price_vnd, active FROM grades WHERE htx_code = %s "
                           f"{'AND active' if active_only else ''} ORDER BY name", (htx_code,)).fetchall()


def add_grade(conn, htx_code: str, name: str, price_vnd: int) -> bool:
    """False when the HTX already has a grade of that name."""
    try:
        conn.execute("INSERT INTO grades (htx_code, name, price_vnd) VALUES (%s, %s, %s)", (htx_code, name, price_vnd))
    except psycopg.errors.UniqueViolation:
        return False
    return True


def update_grade(conn, htx_code: str, grade_id: UUID, price_vnd: int, active: bool) -> bool:
    return conn.execute("UPDATE grades SET price_vnd = %s, active = %s WHERE id = %s AND htx_code = %s RETURNING id",
                        (price_vnd, active, grade_id, htx_code)).fetchone() is not None


# ---------- Tickets ----------

def tickets_on(conn, htx_code: str, day: date) -> list[Ticket]:
    with conn.cursor(row_factory=class_row(Ticket)) as cur:
        return cur.execute(f"SELECT {TICKET_COLUMNS} FROM tickets WHERE htx_code = %s AND weighed_on = %s "
                           "ORDER BY created_at", (htx_code, day)).fetchall()


def get_ticket(conn, htx_code: str, ticket_id: UUID) -> Ticket | None:
    with conn.cursor(row_factory=class_row(Ticket)) as cur:
        return cur.execute(f"SELECT {TICKET_COLUMNS} FROM tickets WHERE htx_code = %s AND id = %s",
                           (htx_code, ticket_id)).fetchone()


def household_tickets(conn, htx_code: str, household_id: str) -> list[Ticket]:
    with conn.cursor(row_factory=class_row(Ticket)) as cur:
        return cur.execute(f"SELECT {TICKET_COLUMNS} FROM tickets WHERE htx_code = %s AND household_id = %s "
                           "AND NOT voided ORDER BY weighed_on DESC, created_at DESC LIMIT 200",
                           (htx_code, household_id)).fetchall()


def add_ticket(conn, htx_code: str, household_id: str, household_name: str, weighed_on: date, grade_id: UUID,
               kg: Decimal, created_by: str) -> UUID | TicketRefusal:
    with conn.transaction():
        _lock_htx(conn, htx_code)
        if _in_closed_range(conn, htx_code, weighed_on):
            return TicketRefusal.CLOSED_RANGE
        row = conn.execute(
            """INSERT INTO tickets (htx_code, household_id, household_name, weighed_on, grade_id, grade_name, kg,
                                    price_vnd, amount_vnd, created_by)
               SELECT %(htx)s, %(hid)s, %(hname)s, %(day)s, g.id, g.name, %(kg)s, g.price_vnd,
                      round(%(kg)s::numeric * g.price_vnd), %(by)s
               FROM grades g WHERE g.id = %(grade)s AND g.htx_code = %(htx)s AND g.active RETURNING id""",
            {"htx": htx_code, "hid": household_id, "hname": household_name, "day": weighed_on, "kg": kg,
             "grade": grade_id, "by": created_by}).fetchone()
    return row[0] if row else TicketRefusal.NOT_FOUND


def edit_ticket(conn, htx_code: str, ticket_id: UUID, household_id: str, household_name: str, weighed_on: date,
                grade_id: UUID, kg: Decimal) -> TicketRefusal | None:
    """Only while the ticket has no period. The price changes only when the grade does."""
    with conn.transaction():
        _lock_htx(conn, htx_code)
        ticket = conn.execute("SELECT voided, period_id, grade_id, price_vnd FROM tickets "
                              "WHERE id = %s AND htx_code = %s FOR UPDATE", (ticket_id, htx_code)).fetchone()
        if ticket is None:
            return TicketRefusal.NOT_FOUND
        voided, period_id, old_grade, old_price = ticket
        if voided or period_id is not None:
            return TicketRefusal.CLOSED
        if _in_closed_range(conn, htx_code, weighed_on):
            return TicketRefusal.CLOSED_RANGE
        grade = conn.execute("SELECT id, name, price_vnd FROM grades WHERE id = %s AND htx_code = %s "
                             "AND (active OR id = %s)", (grade_id, htx_code, old_grade)).fetchone()
        if grade is None:
            return TicketRefusal.NOT_FOUND
        price = old_price if grade[0] == old_grade else grade[2]
        conn.execute(
            """UPDATE tickets SET household_id = %s, household_name = %s, weighed_on = %s, grade_id = %s,
                                  grade_name = %s, kg = %s, price_vnd = %s, amount_vnd = round(%s::numeric * %s)
               WHERE id = %s AND htx_code = %s""",
            (household_id, household_name, weighed_on, grade[0], grade[1], kg, price, kg, price, ticket_id, htx_code))
    return None


def void_ticket(conn, htx_code: str, ticket_id: UUID) -> TicketRefusal | None:
    with conn.transaction():
        _lock_htx(conn, htx_code)
        changed = conn.execute("UPDATE tickets SET voided = true WHERE id = %s AND htx_code = %s AND period_id IS NULL "
                               "AND NOT voided RETURNING id", (ticket_id, htx_code)).fetchone()
        if changed:
            return None
        exists = conn.execute("SELECT 1 FROM tickets WHERE id = %s AND htx_code = %s", (ticket_id, htx_code)).fetchone()
    return TicketRefusal.CLOSED if exists else TicketRefusal.NOT_FOUND


# ---------- Periods and payouts ----------

def close_period(conn, htx_code: str, date_from: date, date_to: date, closed_by: str) -> UUID | PeriodRefusal:
    """One transaction under the HTX lock: no overlap, at least one ticket, then period + tickets + payouts."""
    with conn.transaction():
        _lock_htx(conn, htx_code)
        if conn.execute("SELECT 1 FROM periods WHERE htx_code = %s AND date_from <= %s AND date_to >= %s",
                        (htx_code, date_to, date_from)).fetchone():
            return PeriodRefusal.OVERLAP
        if not conn.execute("SELECT 1 FROM tickets WHERE htx_code = %s AND weighed_on BETWEEN %s AND %s "
                            "AND NOT voided AND period_id IS NULL", (htx_code, date_from, date_to)).fetchone():
            return PeriodRefusal.EMPTY
        period_id = conn.execute("INSERT INTO periods (htx_code, date_from, date_to, closed_by) "
                                 "VALUES (%s, %s, %s, %s) RETURNING id", (htx_code, date_from, date_to, closed_by)
                                 ).fetchone()[0]
        conn.execute("UPDATE tickets SET period_id = %s WHERE htx_code = %s AND weighed_on BETWEEN %s AND %s "
                     "AND NOT voided AND period_id IS NULL", (period_id, htx_code, date_from, date_to))
        conn.execute(
            """INSERT INTO payouts (htx_code, period_id, household_id, household_name, total_kg, total_vnd)
               SELECT htx_code, period_id, household_id, (array_agg(household_name ORDER BY created_at DESC))[1],
                      sum(kg), sum(amount_vnd)
               FROM tickets WHERE htx_code = %s AND period_id = %s GROUP BY htx_code, period_id, household_id""",
            (htx_code, period_id))
    return period_id


def list_periods(conn, htx_code: str) -> list[Period]:
    with conn.cursor(row_factory=class_row(Period)) as cur:
        return cur.execute(
            """SELECT p.id, p.date_from, p.date_to, p.closed_at, count(o.id)::int AS households,
                      count(o.paid_at)::int AS paid, COALESCE(sum(o.total_vnd), 0)::bigint AS total_vnd
               FROM periods p LEFT JOIN payouts o ON o.period_id = p.id AND o.htx_code = p.htx_code
               WHERE p.htx_code = %s GROUP BY p.id ORDER BY p.date_from DESC""", (htx_code,)).fetchall()


def get_period(conn, htx_code: str, period_id: UUID) -> Period | None:
    return next((p for p in list_periods(conn, htx_code) if p.id == period_id), None)


def list_payouts(conn, htx_code: str, period_id: UUID) -> list[Payout]:
    with conn.cursor(row_factory=class_row(Payout)) as cur:
        return cur.execute("SELECT id, household_id, household_name, total_kg, total_vnd, paid_at FROM payouts "
                           "WHERE htx_code = %s AND period_id = %s ORDER BY household_name", (htx_code, period_id)
                           ).fetchall()


def household_payouts(conn, htx_code: str, household_id: str) -> list[tuple[date, date, Payout]]:
    rows = conn.execute(
        """SELECT p.date_from, p.date_to, o.id, o.household_id, o.household_name, o.total_kg, o.total_vnd, o.paid_at
           FROM payouts o JOIN periods p ON p.id = o.period_id AND p.htx_code = o.htx_code
           WHERE o.htx_code = %s AND o.household_id = %s ORDER BY p.date_from DESC LIMIT 50""",
        (htx_code, household_id)).fetchall()
    return [(r[0], r[1], Payout(*r[2:])) for r in rows]


def mark_paid(conn, htx_code: str, period_id: UUID, payout_id: UUID, paid_by: str) -> bool | None:
    """True when marked now, False when it already was, None when it is not in this HTX and period."""
    marked = conn.execute("UPDATE payouts SET paid_at = now(), paid_by = %s WHERE id = %s AND period_id = %s "
                          "AND htx_code = %s AND paid_at IS NULL RETURNING id",
                          (paid_by, payout_id, period_id, htx_code)).fetchone()
    if marked:
        return True
    exists = conn.execute("SELECT 1 FROM payouts WHERE id = %s AND period_id = %s AND htx_code = %s",
                          (payout_id, period_id, htx_code)).fetchone()
    return False if exists else None
