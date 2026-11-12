# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import threading
from datetime import date
from decimal import Decimal

from conftest import add_grade, add_ticket

from leaf_purchase import store
from leaf_purchase.store import PeriodRefusal, TicketRefusal

MAY = (date(2030, 5, 1), date(2030, 5, 15))


def write(conn, grade, kg="12.5", day=date(2030, 5, 2), household="h1", htx="TC"):
    return store.add_ticket(conn, htx, household, f"Hộ {household}", day, grade, Decimal(kg), "kc-officer")


def test_amount_is_kg_times_price(db):
    grade = add_grade(db, price_vnd=8000)
    ticket_id = write(db, grade, "12.5")
    assert db.execute("SELECT kg, price_vnd, amount_vnd FROM tickets WHERE id = %s", (ticket_id,)).fetchone() == (
        Decimal("12.5"), 8000, 100000)
    # The price is a copy: a later price change does not move a written ticket.
    db.execute("UPDATE grades SET price_vnd = 9000 WHERE id = %s", (grade,))
    assert db.execute("SELECT amount_vnd FROM tickets WHERE id = %s", (ticket_id,)).fetchone()[0] == 100000


def test_kg_accepts_comma():
    assert store.parse_kg("12,5") == Decimal("12.5")
    assert store.parse_kg(" 7 ") == Decimal("7") and store.parse_kg("0.5") == Decimal("0.5")
    for bad in ("", "0", "0,0", "-1", "5000,1", "5001", "1,25", "abc", "1e3", "12,5kg", "١٢"):
        assert store.parse_kg(bad) is None, bad
    assert store.parse_kg("5000") == Decimal("5000")


def test_ticket_in_closed_period_cannot_be_edited_or_voided(db):
    grade = add_grade(db)
    ticket_id = write(db, grade)
    assert isinstance(store.close_period(db, "TC", *MAY, "kc-manager"), store.UUID)
    edit = store.edit_ticket(db, "TC", ticket_id, "h1", "Hộ h1", date(2030, 5, 2), grade, Decimal("99.0"))
    assert edit is TicketRefusal.CLOSED
    assert store.void_ticket(db, "TC", ticket_id) is TicketRefusal.CLOSED
    assert db.execute("SELECT kg, voided FROM tickets WHERE id = %s", (ticket_id,)).fetchone() == (Decimal("12.5"), False)


def test_ticket_cannot_be_written_into_a_closed_range(db):
    grade = add_grade(db)
    write(db, grade)
    store.close_period(db, "TC", *MAY, "kc-manager")
    assert write(db, grade, day=date(2030, 5, 10)) is TicketRefusal.CLOSED_RANGE
    assert write(db, grade, day=date(2030, 5, 16)) is not TicketRefusal.CLOSED_RANGE


def test_overlapping_period_is_refused(db):
    grade = add_grade(db)
    write(db, grade, day=date(2030, 5, 2))
    store.close_period(db, "TC", *MAY, "kc-manager")
    write(db, grade, day=date(2030, 5, 20))
    for span in ((date(2030, 5, 15), date(2030, 5, 31)), (date(2030, 4, 20), date(2030, 5, 1)),
                 (date(2030, 5, 5), date(2030, 5, 6)), (date(2030, 4, 1), date(2030, 6, 1))):
        assert store.close_period(db, "TC", *span, "kc-manager") is PeriodRefusal.OVERLAP, span
    assert db.execute("SELECT count(*) FROM periods").fetchone()[0] == 1
    # Another HTX has its own calendar.
    other = add_grade(db, htx="LB")
    write(db, other, htx="LB")
    assert isinstance(store.close_period(db, "LB", *MAY, "kc-manager-lb"), store.UUID)


def test_two_concurrent_closes_create_one_period(db, pg_url):
    grade = add_grade(db)
    write(db, grade)
    start = threading.Barrier(2)
    results = []

    def close():
        with store.connect(pg_url) as conn:
            start.wait()
            results.append(store.close_period(conn, "TC", *MAY, "kc-manager"))

    threads = [threading.Thread(target=close) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(type(r).__name__ for r in results) == sorted(["UUID", "PeriodRefusal"])
    assert PeriodRefusal.OVERLAP in results
    assert db.execute("SELECT count(*) FROM periods").fetchone()[0] == 1
    assert db.execute("SELECT count(*) FROM payouts").fetchone()[0] == 1


def test_close_needs_a_ticket(db):
    grade = add_grade(db)
    assert store.close_period(db, "TC", *MAY, "kc-manager") is PeriodRefusal.EMPTY
    write(db, grade, day=date(2030, 6, 1))  # outside the range
    write(db, grade, htx="LB")  # grade of another HTX: refused, nothing written
    other = add_grade(db, htx="LB")
    write(db, other, htx="LB")  # a ticket of another HTX in the range does not count
    assert store.close_period(db, "TC", *MAY, "kc-manager") is PeriodRefusal.EMPTY
    assert db.execute("SELECT count(*) FROM periods").fetchone()[0] == 0


def test_close_writes_one_payout_per_household(db):
    grade = add_grade(db, price_vnd=8000)
    write(db, grade, "10.0", household="h1")
    write(db, grade, "2.5", household="h1", day=date(2030, 5, 3))
    write(db, grade, "4.0", household="h2")
    period_id = store.close_period(db, "TC", *MAY, "kc-manager")
    rows = db.execute("SELECT household_id, total_kg, total_vnd, paid_at FROM payouts WHERE period_id = %s "
                      "ORDER BY household_id", (period_id,)).fetchall()
    assert rows == [("h1", Decimal("12.5"), 100000, None), ("h2", Decimal("4.0"), 32000, None)]
    assert db.execute("SELECT count(*) FROM tickets WHERE period_id = %s", (period_id,)).fetchone()[0] == 3
    assert db.execute("SELECT closed_by FROM periods WHERE id = %s", (period_id,)).fetchone()[0] == "kc-manager"


def test_voided_ticket_is_not_paid(db):
    grade = add_grade(db)
    keep = write(db, grade, "10.0", household="h1")
    gone = write(db, grade, "50.0", household="h2")
    assert store.void_ticket(db, "TC", gone) is None
    period_id = store.close_period(db, "TC", *MAY, "kc-manager")
    assert db.execute("SELECT household_id, total_vnd FROM payouts WHERE period_id = %s", (period_id,)).fetchall() == [
        ("h1", 80000)]
    assert db.execute("SELECT period_id FROM tickets WHERE id = %s", (gone,)).fetchone()[0] is None
    assert db.execute("SELECT period_id FROM tickets WHERE id = %s", (keep,)).fetchone()[0] == period_id
    # Only voided tickets in the range: nothing to pay.
    only_voided = add_ticket(db, grade, weighed_on="2030-07-02", voided=True)
    assert only_voided and store.close_period(db, "TC", date(2030, 7, 1), date(2030, 7, 31), "m") is PeriodRefusal.EMPTY
