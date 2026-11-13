# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Phiếu cân, loại chè, kỳ và chi trả trong schema app_leaf_purchase. Mọi truy vấn lọc theo htx_code lấy từ token."""
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from enum import Enum
from uuid import UUID

import psycopg
from psycopg.rows import class_row

from leaf_purchase.appkit import like_pattern

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
class ListedTicket(Ticket):
    """A ticket with the dates of its period, for the list, the CSV and the farmer page."""
    period_from: date | None
    period_to: date | None


@dataclass(frozen=True)
class TicketFilter:
    date_from: date | None = None
    date_to: date | None = None
    household_id: str = ""
    grade_id: UUID | None = None
    status: str = "active"  # active | voided | all
    q: str = ""


@dataclass(frozen=True)
class Totals:
    kg: Decimal
    vnd: int
    tickets: int


@dataclass(frozen=True)
class TopHousehold:
    household_name: str
    kg: Decimal
    vnd: int


@dataclass(frozen=True)
class Overview:
    today_kg: Decimal
    today_vnd: int
    today_tickets: int
    month_kg: Decimal
    month_vnd: int
    month_tickets: int
    open_kg: Decimal
    open_vnd: int
    unpaid_vnd: int
    unpaid_households: int
    days: list[tuple[date, Decimal]]
    top: list[TopHousehold]


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


LISTED_COLUMNS = ("t.id, t.household_id, t.household_name, t.weighed_on, t.grade_id, t.grade_name, t.kg, "
                  "t.price_vnd, t.amount_vnd, t.voided, t.period_id, p.date_from AS period_from, p.date_to AS period_to")
LISTED_FROM = "FROM tickets t LEFT JOIN periods p ON p.id = t.period_id AND p.htx_code = t.htx_code"


def _where(htx_code: str, f: TicketFilter) -> tuple[str, dict]:
    """The filter as a WHERE clause; every value is a parameter, the search text is escaped for ILIKE."""
    clauses, params = ["t.htx_code = %(htx)s"], {"htx": htx_code}
    if f.date_from:
        clauses.append("t.weighed_on >= %(from)s")
        params["from"] = f.date_from
    if f.date_to:
        clauses.append("t.weighed_on <= %(to)s")
        params["to"] = f.date_to
    if f.household_id:
        clauses.append("t.household_id = %(household)s")
        params["household"] = f.household_id
    if f.grade_id:
        clauses.append("t.grade_id = %(grade)s")
        params["grade"] = f.grade_id
    if f.status != "all":
        clauses.append("t.voided" if f.status == "voided" else "NOT t.voided")
    if f.q:
        clauses.append("t.household_name ILIKE %(q)s ESCAPE '\\'")
        params["q"] = like_pattern(f.q)
    return " AND ".join(clauses), params


def ticket_totals(conn, htx_code: str, f: TicketFilter) -> Totals:
    """Sums of the filtered tickets that are not voided: a voided ticket's kg and money are not real."""
    where, params = _where(htx_code, f)
    row = conn.execute(f"SELECT COALESCE(sum(t.kg), 0), COALESCE(sum(t.amount_vnd), 0)::bigint, count(*) "
                       f"FROM tickets t WHERE {where} AND NOT t.voided", params).fetchone()
    return Totals(row[0], row[1], row[2])


def count_tickets(conn, htx_code: str, f: TicketFilter) -> int:
    """Rows the list shows (voided ones too under status all or voided), for paging."""
    where, params = _where(htx_code, f)
    return conn.execute(f"SELECT count(*) FROM tickets t WHERE {where}", params).fetchone()[0]


def list_tickets(conn, htx_code: str, f: TicketFilter, limit: int | None = None, offset: int = 0) -> list[ListedTicket]:
    """Newest first; limit None returns every matching row (the CSV)."""
    where, params = _where(htx_code, f)
    with conn.cursor(row_factory=class_row(ListedTicket)) as cur:
        return cur.execute(f"SELECT {LISTED_COLUMNS} {LISTED_FROM} WHERE {where} "
                           "ORDER BY t.weighed_on DESC, t.created_at DESC, t.id LIMIT %(limit)s OFFSET %(offset)s",
                           {**params, "limit": limit, "offset": offset}).fetchall()


def ticket_households(conn, htx_code: str) -> list[tuple[str, str]]:
    """(id, latest name) of every household with a ticket, for the filter dropdown."""
    return conn.execute("SELECT household_id, (array_agg(household_name ORDER BY created_at DESC))[1] AS name "
                        "FROM tickets WHERE htx_code = %s GROUP BY household_id ORDER BY name", (htx_code,)).fetchall()


def get_listed_ticket(conn, htx_code: str, ticket_id: UUID) -> ListedTicket | None:
    with conn.cursor(row_factory=class_row(ListedTicket)) as cur:
        return cur.execute(f"SELECT {LISTED_COLUMNS} {LISTED_FROM} WHERE t.htx_code = %s AND t.id = %s",
                           (htx_code, ticket_id)).fetchone()


def household_months(conn, htx_code: str, household_id: str) -> list[str]:
    """YYYY-MM of every month the household has a ticket in, newest first."""
    return [r[0] for r in conn.execute(
        "SELECT DISTINCT to_char(weighed_on, 'YYYY-MM') AS month FROM tickets WHERE htx_code = %s AND household_id = %s "
        "AND NOT voided ORDER BY month DESC", (htx_code, household_id)).fetchall()]


def household_month_total(conn, htx_code: str, household_id: str, first_day: date) -> Totals:
    row = conn.execute("SELECT COALESCE(sum(kg), 0), COALESCE(sum(amount_vnd), 0)::bigint, count(*) FROM tickets "
                       "WHERE htx_code = %s AND household_id = %s AND NOT voided AND weighed_on >= %s "
                       "AND weighed_on < %s", (htx_code, household_id, first_day, _next_month(first_day))).fetchone()
    return Totals(row[0], row[1], row[2])


def household_unpaid_vnd(conn, htx_code: str, household_id: str) -> int:
    return conn.execute("SELECT COALESCE(sum(total_vnd), 0)::bigint FROM payouts WHERE htx_code = %s "
                        "AND household_id = %s AND paid_at IS NULL", (htx_code, household_id)).fetchone()[0]


def _next_month(first_day: date) -> date:
    return (first_day.replace(day=28) + timedelta(days=4)).replace(day=1)


def overview(conn, htx_code: str, today: date) -> Overview:
    """Figures of the manager's overview. `today` is the Vietnam date; the month runs from its 1st."""
    first = today.replace(day=1)
    row = conn.execute(
        """SELECT COALESCE(sum(kg) FILTER (WHERE weighed_on = %(today)s), 0),
                  COALESCE(sum(amount_vnd) FILTER (WHERE weighed_on = %(today)s), 0)::bigint,
                  count(*) FILTER (WHERE weighed_on = %(today)s),
                  COALESCE(sum(kg) FILTER (WHERE weighed_on >= %(first)s AND weighed_on < %(next)s), 0),
                  COALESCE(sum(amount_vnd) FILTER (WHERE weighed_on >= %(first)s AND weighed_on < %(next)s), 0)::bigint,
                  count(*) FILTER (WHERE weighed_on >= %(first)s AND weighed_on < %(next)s),
                  COALESCE(sum(kg) FILTER (WHERE period_id IS NULL), 0),
                  COALESCE(sum(amount_vnd) FILTER (WHERE period_id IS NULL), 0)::bigint
           FROM tickets WHERE htx_code = %(htx)s AND NOT voided""",
        {"htx": htx_code, "today": today, "first": first, "next": _next_month(first)}).fetchone()
    unpaid = conn.execute("SELECT COALESCE(sum(total_vnd), 0)::bigint, count(DISTINCT household_id) FROM payouts "
                          "WHERE htx_code = %s AND paid_at IS NULL", (htx_code,)).fetchone()
    start = today - timedelta(days=13)
    per_day = dict(conn.execute("SELECT weighed_on, sum(kg) FROM tickets WHERE htx_code = %s AND NOT voided "
                                "AND weighed_on BETWEEN %s AND %s GROUP BY weighed_on", (htx_code, start, today)))
    days = [(start + timedelta(days=i), per_day.get(start + timedelta(days=i), Decimal(0))) for i in range(14)]
    with conn.cursor(row_factory=class_row(TopHousehold)) as cur:
        top = cur.execute(
            """SELECT (array_agg(household_name ORDER BY created_at DESC))[1] AS household_name, sum(kg) AS kg,
                      sum(amount_vnd)::bigint AS vnd
               FROM tickets WHERE htx_code = %s AND NOT voided AND weighed_on >= %s AND weighed_on < %s
               GROUP BY household_id ORDER BY sum(kg) DESC, household_id LIMIT 10""",
            (htx_code, first, _next_month(first))).fetchall()
    return Overview(*row, unpaid[0], unpaid[1], days, top)


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


def household_ticket_page(conn, htx_code: str, household_id: str, month: str, limit: int, offset: int
                          ) -> tuple[int, list[ListedTicket]]:
    """(total, rows) of a household's tickets, optionally one month (YYYY-MM)."""
    where, params = "t.htx_code = %(htx)s AND t.household_id = %(hid)s AND NOT t.voided", {"htx": htx_code, "hid": household_id}
    if month:
        first = date.fromisoformat(month + "-01")
        where += " AND t.weighed_on >= %(first)s AND t.weighed_on < %(next)s"
        params |= {"first": first, "next": _next_month(first)}
    total = conn.execute(f"SELECT count(*) FROM tickets t WHERE {where}", params).fetchone()[0]
    with conn.cursor(row_factory=class_row(ListedTicket)) as cur:
        rows = cur.execute(f"SELECT {LISTED_COLUMNS} {LISTED_FROM} WHERE {where} "
                           "ORDER BY t.weighed_on DESC, t.created_at DESC, t.id LIMIT %(limit)s OFFSET %(offset)s",
                           {**params, "limit": limit, "offset": offset}).fetchall()
    return total, rows


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
