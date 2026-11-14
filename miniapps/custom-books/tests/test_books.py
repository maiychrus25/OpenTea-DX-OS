# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import re
import uuid
from datetime import date

import pytest
from conftest import add_book, add_record, bearer
from fastapi.testclient import TestClient

from custom_books import core_client, main
from custom_books.core_client import Household
from custom_books.fields import Field

PREFIX = "/apps/custom-books"
MANAGER = bearer()
OFFICER = bearer(sub="kc-officer", roles=("officer",), name="Cán bộ Hà")
FARMER = bearer(sub="kc-farmer-1", roles=("farmer",), name="Nguyễn Văn An")
FARMER2 = bearer(sub="kc-farmer-2", roles=("farmer",), name="Lê Thị Hoa")
HOUSEHOLDS = [Household("h1", "Nguyễn Văn An", "kc-farmer-1"), Household("h2", "Lê Thị Hoa", "kc-farmer-2")]
FIELDS = (Field("f1", "Ngày", "date", True, True), Field("f2", "Nông hộ", "household", True, True),
          Field("f3", "Số ký hái", "number", True, True, True, unit="kg"),
          Field("f4", "Loại chè", "choice", False, True, options=("Chè búp tươi", "Chè già")),
          Field("f5", "Ghi chú", "long_text"), Field("f6", "Tiền công", "money", False, False, True))


@pytest.fixture
def client(db, monkeypatch):
    def fake(authorization, role):  # Hasura gives a farmer only their own household
        if role == "farmer":
            return [h for h in HOUSEHOLDS if h.keycloak_user_id and h.keycloak_user_id in authorization_sub(authorization)]
        return HOUSEHOLDS
    monkeypatch.setattr(core_client, "list_households", fake)
    with TestClient(main.app, root_path=main.PREFIX, raise_server_exceptions=False, follow_redirects=False) as c:
        yield c


def authorization_sub(authorization: str) -> str:
    import base64, json
    payload = authorization.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))["sub"]


def rec(db, book, user="kc-farmer-1", name="Nguyễn Văn An", day="2026-11-10", kg="10", household="h1", kind="Chè búp tươi",
        note="", money=None, status="APPROVED", htx="TC"):
    data = {"f1": day, "f2": household, "f3": kg, "f4": kind}
    if note:
        data["f5"] = note
    if money is not None:
        data["f6"] = money
    return add_record(db, book, data, htx=htx, created_by=user, created_by_name=name, entry_date=day,
                      status=status, household_id=household)


def form(**over):
    base = {"f1": "2026-11-12", "f2": "h1", "f3": "12,5", "f4": "Chè già", "f5": "Hái sớm"}
    base.update(over)
    return {k: v for k, v in base.items() if v is not None}


def ids_on(db, book):
    return {r[0] for r in db.execute("SELECT id FROM records WHERE book_id = %s", (book,)).fetchall()}


# ---------- access matrix ----------

READS = ["", "/summary", "/export.csv", "/print"]


def book_with(db, officer, farmer=None, approval=False, status="PUBLISHED", **kw):
    return add_book(db, fields=FIELDS, officer=officer, farmer=farmer or officer, approval=approval, status=status, **kw)


@pytest.mark.parametrize("level,reads,writes", [("none", 403, 403), ("view", 200, 403), ("own", 200, 200), ("all", 200, 200)])
def test_matrix_officer_levels(client, db, level, reads, writes):
    book = book_with(db, level)
    mine = rec(db, book, user="kc-officer", name="Cán bộ Hà")
    for tail in READS:
        assert client.get(f"/b/{book}{tail}", headers=OFFICER).status_code == reads, tail
    assert client.get(f"/b/{book}/new", headers=OFFICER).status_code == writes
    assert client.post(f"/b/{book}/records", headers=OFFICER, data=form()).status_code == (303 if writes == 200 else 403)
    assert client.get(f"/b/{book}/r/{mine}/edit", headers=OFFICER).status_code == (200 if level in ("own", "all") else 403)
    assert client.post(f"/b/{book}/r/{mine}/edit", headers=OFFICER, data=form()).status_code == (
        303 if level in ("own", "all") else 403)
    assert client.get(f"/b/{book}/r/{mine}/delete", headers=OFFICER).status_code == (
        200 if level in ("own", "all") else 403)
    assert client.post(f"/b/{book}/r/{mine}/delete", headers=OFFICER).status_code == (
        303 if level in ("own", "all") else 403)


def test_matrix_other_peoples_rows(client, db):
    for level, expected in (("view", 403), ("own", 404), ("all", 403)):
        book = book_with(db, level)
        theirs = rec(db, book, user="kc-farmer-1")
        for call in (lambda: client.get(f"/b/{book}/r/{theirs}/edit", headers=OFFICER),
                     lambda: client.post(f"/b/{book}/r/{theirs}/edit", headers=OFFICER, data=form()),
                     lambda: client.get(f"/b/{book}/r/{theirs}/delete", headers=OFFICER),
                     lambda: client.post(f"/b/{book}/r/{theirs}/delete", headers=OFFICER)):
            assert call().status_code == expected, level
        assert theirs in ids_on(db, book)


def test_manager_can_do_everything(client, db):
    book = book_with(db, "none", "none")
    theirs = rec(db, book, user="kc-farmer-1")
    for tail in READS + ["/new", f"/r/{theirs}/edit", f"/r/{theirs}/delete"]:
        assert client.get(f"/b/{book}{tail}", headers=MANAGER).status_code == 200, tail
    assert client.post(f"/b/{book}/r/{theirs}/edit", headers=MANAGER, data=form()).status_code == 303
    assert client.post(f"/b/{book}/r/{theirs}/delete", headers=MANAGER).status_code == 303
    assert ids_on(db, book) == set()


def test_farmer_level_uses_the_farmer_column(client, db):
    book = book_with(db, "none", "own")
    assert client.get(f"/b/{book}", headers=OFFICER).status_code == 403
    assert client.get(f"/b/{book}", headers=FARMER).status_code == 200
    assert client.get(f"/b/{book}", headers=bearer(roles=())).status_code == 403
    assert client.get(f"/b/{book}").status_code == 401


def test_own_level_sees_only_own_rows(client, db):
    book = book_with(db, "own", "own")
    mine = rec(db, book, user="kc-farmer-1", kg="10", note="GHICHU-CUA-AN", money=100000)
    theirs = rec(db, book, user="kc-farmer-2", name="Lê Thị Hoa", household="h2", kg="99", note="GHICHU-CUA-HOA",
                 money=900000, kind="Chè già")
    for tail in ("", "/export.csv", "/print", "/summary"):
        body = client.get(f"/b/{book}{tail}", headers=FARMER).text
        assert "Lê Thị Hoa" not in body and "GHICHU-CUA-HOA" not in body and "99" not in body.replace("1999", ""), tail
    assert "GHICHU-CUA-AN" in client.get(f"/b/{book}/export.csv", headers=FARMER).text
    summary = client.get(f"/b/{book}/summary", headers=FARMER).text
    assert "100.000 ₫" in summary and "900.000" not in summary and "109" not in summary
    # typing the URL of the other person's row
    for path in (f"/b/{book}/r/{theirs}/edit", f"/b/{book}/r/{theirs}/delete"):
        assert client.get(path, headers=FARMER).status_code == 404
    assert client.post(f"/b/{book}/r/{theirs}/delete", headers=FARMER).status_code == 404
    assert client.post(f"/b/{book}/r/{theirs}/edit", headers=FARMER, data=form()).status_code == 404
    assert {mine, theirs} == ids_on(db, book)
    # the filters cannot widen it
    assert "Lê Thị Hoa" not in client.get(f"/b/{book}?household=h2&q=GHICHU&c_f4=Chè già", headers=FARMER).text
    assert "Lê Thị Hoa" not in client.get(f"/b/{book}/export.csv?household=h2", headers=FARMER).text


def test_all_level_sees_everyone_and_view_too(client, db):
    for level in ("all", "view"):
        book = book_with(db, level)
        rec(db, book, user="kc-farmer-2", name="Lê Thị Hoa", household="h2", note="GHICHU-HOA")
        assert "Lê Thị Hoa" in client.get(f"/b/{book}", headers=OFFICER).text
        assert "GHICHU-HOA" in client.get(f"/b/{book}/export.csv", headers=OFFICER).text


def test_draft_and_archived_books_are_for_the_manager_only(client, db):
    for status in ("DRAFT", "ARCHIVED"):
        book = book_with(db, "all", status=status)
        for tail in READS + ["/new"]:
            assert client.get(f"/b/{book}{tail}", headers=OFFICER).status_code == 404, (status, tail)
            assert client.get(f"/b/{book}{tail}", headers=MANAGER).status_code == 200, (status, tail)
        assert client.post(f"/b/{book}/records", headers=OFFICER, data=form()).status_code == 404
        assert client.post(f"/b/{book}/records", headers=MANAGER, data=form()).status_code == 409


def test_two_htxs_are_isolated(client, db):
    other = add_book(db, htx="LB", fields=FIELDS, officer="all", farmer="all")
    other_rec = rec(db, other, htx="LB", note="BI-MAT-LB")
    mine = book_with(db, "all", "all")
    mine_rec = rec(db, mine)
    for headers in (MANAGER, OFFICER, FARMER):
        for tail in READS + ["/new", f"/r/{other_rec}/edit", f"/r/{other_rec}/delete"]:
            assert client.get(f"/b/{other}{tail}", headers=headers).status_code == 404, tail
    assert client.post(f"/b/{other}/records", headers=MANAGER, data=form()).status_code == 404
    # a row of the other HTX under my book's URL
    assert client.get(f"/b/{mine}/r/{other_rec}/edit", headers=MANAGER).status_code == 404
    assert client.post(f"/b/{mine}/r/{other_rec}/delete", headers=MANAGER).status_code == 404
    assert client.post(f"/b/{mine}/r/{other_rec}/approve", headers=MANAGER).status_code in (404, 409)
    assert "BI-MAT-LB" not in client.get(f"/b/{mine}/export.csv", headers=MANAGER).text
    assert {other_rec} == ids_on(db, other) and mine_rec in ids_on(db, mine)
    assert client.get(f"/b/{uuid.uuid4()}", headers=MANAGER).status_code == 404
    assert client.get("/b/not-a-uuid", headers=MANAGER).status_code == 404


# ---------- entering rows ----------

def test_create_row_stores_typed_values_and_dates(client, db):
    book = book_with(db, "all", "own")
    reply = client.post(f"/b/{book}/records", headers=FARMER, data=form())
    assert reply.status_code == 303 and reply.headers["location"] == f"{PREFIX}/b/{book}?notice=saved"
    row = db.execute("SELECT data, entry_date, household_id, status, created_by, created_by_name FROM records").fetchone()
    assert row[0] == {"f1": "2026-11-12", "f2": "h1", "f3": "12.5", "f4": "Chè già", "f5": "Hái sớm"}
    assert row[1] == date(2026, 11, 12) and row[2] == "h1" and row[3] == "APPROVED"
    assert row[4] == "kc-farmer-1" and row[5] == "Nguyễn Văn An"
    assert "Đã ghi" in client.get(f"/b/{book}?notice=saved", headers=FARMER).text


def test_entry_date_is_the_first_date_field_else_the_creation_day(client, db):
    book = add_book(db, fields=(Field("f1", "Nội dung", "text", True, True), Field("f2", "Hạn", "date"),
                                Field("f3", "Ngày mua", "date")))
    assert client.post(f"/b/{book}/records", headers=MANAGER, data={"f1": "a", "f2": "2026-03-04", "f3": "2026-05-06"}).status_code == 303
    nodate = add_book(db, name="Không có ngày", fields=(Field("f1", "Nội dung", "text", True, True),))
    assert client.post(f"/b/{nodate}/records", headers=MANAGER, data={"f1": "a"}).status_code == 303
    dates = dict(db.execute("SELECT book_id, entry_date FROM records").fetchall())
    assert dates[book] == date(2026, 3, 4) and dates[nodate] == main.today()


def test_create_errors_keep_typed_values(client, db):
    book = book_with(db, "all", "own")
    reply = client.post(f"/b/{book}/records", headers=OFFICER,
                        data=form(f3="abc", f1="", f5="Nhập dở", f4="Không có"))
    assert reply.status_code == 400
    assert "Nhập dở" in reply.text and "abc" in reply.text and "field-error" in reply.text
    assert reply.text.count('aria-invalid="true"') >= 3
    assert ids_on(db, book) == set()


def test_farmer_can_only_choose_their_own_household(client, db):
    book = book_with(db, "all", "own")
    assert client.post(f"/b/{book}/records", headers=FARMER, data=form(f2="h2")).status_code == 400
    assert ids_on(db, book) == set()
    page = client.get(f"/b/{book}/new", headers=FARMER).text
    assert "Nguyễn Văn An" in page and "Lê Thị Hoa" not in page
    assert client.post(f"/b/{book}/records", headers=OFFICER, data=form(f2="h2")).status_code == 303


def test_core_down_blocks_household_rows_with_a_message(client, db, monkeypatch):
    def down(authorization, role):
        raise core_client.CoreError("down")
    monkeypatch.setattr(core_client, "list_households", down)
    book = book_with(db, "all")
    assert client.post(f"/b/{book}/records", headers=OFFICER, data=form()).status_code == 400
    assert client.get(f"/b/{book}/new", headers=OFFICER).status_code == 200


def test_hostile_values_are_shown_as_text(client, db):
    book = book_with(db, "all")
    evil = "<script>alert(1)</script>'); DROP TABLE records;--"
    assert client.post(f"/b/{book}/records", headers=OFFICER, data=form(f5=evil)).status_code == 303
    assert db.execute("SELECT count(*) FROM records").fetchone()[0] == 1
    book2 = add_book(db, name="Sổ chữ", fields=(Field("f1", "Tên", "text", True, True),), officer="all")
    assert client.post(f"/b/{book2}/records", headers=OFFICER, data={"f1": evil}).status_code == 303
    body = client.get(f"/b/{book2}", headers=OFFICER).text
    assert "<script>alert(1)</script>" not in body and "&lt;script&gt;" in body
    assert "<script>" not in client.get(f"/b/{book2}/print", headers=OFFICER).text


def test_edit_and_delete_flow(client, db):
    book = book_with(db, "own", "own")
    mine = rec(db, book, user="kc-farmer-1")
    assert 'name="f3"' in client.get(f"/b/{book}/r/{mine}/edit", headers=FARMER).text
    reply = client.post(f"/b/{book}/r/{mine}/edit", headers=FARMER, data=form(f3="7"))
    assert reply.status_code == 303 and reply.headers["location"] == f"{PREFIX}/b/{book}?notice=saved"
    assert db.execute("SELECT data->>'f3' FROM records WHERE id = %s", (mine,)).fetchone()[0] == "7"
    bad = client.post(f"/b/{book}/r/{mine}/edit", headers=FARMER, data=form(f3="x", f5="Gõ dở"))
    assert bad.status_code == 400 and "Gõ dở" in bad.text
    page = client.get(f"/b/{book}/r/{mine}/delete", headers=FARMER)
    assert page.status_code == 200 and "Xoá dòng" in page.text and mine in ids_on(db, book)
    reply = client.post(f"/b/{book}/r/{mine}/delete", headers=FARMER)
    assert reply.status_code == 303 and reply.headers["location"] == f"{PREFIX}/b/{book}?notice=deleted"
    assert ids_on(db, book) == set()
    assert client.get(f"/b/{book}/r/{mine}/edit", headers=FARMER).status_code == 404


# ---------- approval ----------

def test_approval_flow_and_resubmission(client, db):
    book = book_with(db, "all", "own", approval=True)
    assert client.post(f"/b/{book}/records", headers=FARMER, data=form()).status_code == 303
    (rid,) = ids_on(db, book)
    status = lambda: db.execute("SELECT status, reject_reason, decided_by_name FROM records WHERE id = %s", (rid,)).fetchone()
    assert status()[0] == "PENDING"
    assert "Chờ duyệt" in client.get(f"/b/{book}", headers=FARMER).text
    # only the manager decides
    for headers in (FARMER, OFFICER):
        assert client.post(f"/b/{book}/r/{rid}/approve", headers=headers).status_code == 403
        assert client.post(f"/b/{book}/r/{rid}/reject", headers=headers, data={"reason": "x"}).status_code == 403
    # a reason is required, 1-200 characters
    for reason in ("", "   ", "x" * 201):
        assert client.post(f"/b/{book}/r/{rid}/reject", headers=MANAGER, data={"reason": reason}).status_code == 400
    assert status()[0] == "PENDING"
    reply = client.post(f"/b/{book}/r/{rid}/reject", headers=MANAGER, data={"reason": "Sai số ký"})
    assert reply.status_code == 303 and "notice=rejected" in reply.headers["location"]
    assert status() == ("REJECTED", "Sai số ký", "Quản trị TC")
    assert "Sai số ký" in client.get(f"/b/{book}", headers=FARMER).text
    # the author fixes it: back to pending, the old reason is gone
    assert client.post(f"/b/{book}/r/{rid}/edit", headers=FARMER, data=form(f3="9")).status_code == 303
    assert status() == ("PENDING", None, None)
    reply = client.post(f"/b/{book}/r/{rid}/approve", headers=MANAGER)
    assert reply.status_code == 303 and "notice=approved" in reply.headers["location"]
    assert status() == ("APPROVED", None, "Quản trị TC")


def test_approved_rows_are_locked_for_their_author(client, db):
    book = book_with(db, "own", "own", approval=True)
    rid = rec(db, book, user="kc-farmer-1", status="APPROVED", kg="10")
    assert client.get(f"/b/{book}/r/{rid}/edit", headers=FARMER).status_code == 403
    assert client.post(f"/b/{book}/r/{rid}/edit", headers=FARMER, data=form(f3="999")).status_code == 403
    assert client.get(f"/b/{book}/r/{rid}/delete", headers=FARMER).status_code == 403
    assert client.post(f"/b/{book}/r/{rid}/delete", headers=FARMER).status_code == 403
    assert db.execute("SELECT data->>'f3' FROM records WHERE id = %s", (rid,)).fetchone()[0] == "10"
    assert 'href="' + PREFIX + f"/b/{book}/r/{rid}/edit" not in client.get(f"/b/{book}", headers=FARMER).text
    assert client.post(f"/b/{book}/r/{rid}/edit", headers=MANAGER, data=form(f3="11")).status_code == 303
    assert db.execute("SELECT status FROM records WHERE id = %s", (rid,)).fetchone()[0] == "APPROVED"  # the manager's edit keeps it
    # the same row in a book without approval stays editable
    plain = book_with(db, "own", "own", approval=False)
    rid2 = rec(db, plain, user="kc-farmer-1")
    assert client.post(f"/b/{plain}/r/{rid2}/edit", headers=FARMER, data=form()).status_code == 303


def test_pending_and_rejected_rows_stay_editable_and_manager_rows_start_approved(client, db):
    book = book_with(db, "own", "own", approval=True)
    for status in ("PENDING", "REJECTED"):
        rid = rec(db, book, user="kc-farmer-1", status=status)
        assert client.get(f"/b/{book}/r/{rid}/edit", headers=FARMER).status_code == 200
    assert client.post(f"/b/{book}/records", headers=MANAGER, data=form()).status_code == 303
    assert db.execute("SELECT status FROM records WHERE created_by = 'kc-manager-tc'").fetchone()[0] == "APPROVED"


def test_approve_and_reject_need_an_approval_book_and_a_pending_row(client, db):
    plain = book_with(db, "all", "all", approval=False)
    rid = rec(db, plain)
    assert client.post(f"/b/{plain}/r/{rid}/approve", headers=MANAGER).status_code == 409
    book = book_with(db, "all", "all", approval=True)
    done = rec(db, book, status="APPROVED")
    reply = client.post(f"/b/{book}/r/{done}/reject", headers=MANAGER, data={"reason": "Muộn"})
    assert reply.status_code == 303 and "unchanged" in reply.headers["location"]
    assert db.execute("SELECT status FROM records WHERE id = %s", (done,)).fetchone()[0] == "APPROVED"
    assert client.post(f"/b/{book}/r/{uuid.uuid4()}/approve", headers=MANAGER).status_code == 404


# ---------- list: filters, paging, totals ----------

def seed_list(db):
    book = book_with(db, "all", "all")
    rec(db, book, user="kc-farmer-1", name="Nguyễn Văn An", day="2026-11-01", kg="10", household="h1",
        kind="Chè búp tươi", note="Hái lô Đồi Cao")
    rec(db, book, user="kc-farmer-2", name="Lê Thị Hoa", day="2026-11-05", kg="20,5".replace(",", "."), household="h2",
        kind="Chè già", note="Giảm 50% giá_trị")
    rec(db, book, user="kc-farmer-2", name="Lê Thị Hoa", day="2026-11-09", kg="5", household="h2", kind="Chè búp tươi")
    return book


def names_in(body: str) -> list[str]:
    return [n for n in ("Hái lô Đồi Cao", "Giảm 50% giá_trị") if n in body]


def test_list_shows_columns_totals_and_tabs(client, db):
    book = seed_list(db)
    body = client.get(f"/b/{book}", headers=MANAGER).text
    for text in ("Ngày", "Nông hộ", "Số ký hái", "Loại chè", "Người ghi", "Lê Thị Hoa", "05/11/2026", "20,5 kg",
                 "Danh sách", "Tổng hợp", "Thiết kế", "35,5", "Ghi dòng mới", "Tải CSV", "Bản in"):
        assert text in body, text
    assert "Tình trạng" not in body and "Ghi chú" not in body.split("<tbody")[0]
    assert "Thiết kế" not in client.get(f"/b/{book}", headers=OFFICER).text
    assert "Ghi dòng mới" not in client.get(f"/b/{book_with(db, 'view')}", headers=OFFICER).text


def test_filters_one_by_one(client, db):
    book = seed_list(db)
    get = lambda q: client.get(f"/b/{book}?{q}", headers=MANAGER).text.partition("<tbody")[2]  # the rows only
    assert "Lê Thị Hoa" not in get("household=h1") and "Nguyễn Văn An" in get("household=h1")
    assert get("from=2026-11-05").count("Lê Thị Hoa") >= 2 and "01/11/2026" not in get("from=2026-11-05")
    assert "09/11/2026" not in get("to=2026-11-05") and "05/11/2026" in get("to=2026-11-05")
    only_old = get("c_f4=Chè già")
    assert "20,5 kg" in only_old and "10 kg" not in only_old and "5 kg" not in only_old.replace("20,5 kg", "")
    csv = lambda q: names_in(client.get(f"/b/{book}/export.csv?{q}", headers=MANAGER).content.decode("utf-8-sig"))
    assert csv("q=Đồi") == ["Hái lô Đồi Cao"] and csv("q=") == ["Hái lô Đồi Cao", "Giảm 50% giá_trị"]
    assert "Nguyễn Văn An" not in get("q=Hoa")  # the author's name is searched too
    assert "Lê Thị Hoa" not in get("q=Nguyễn")
    # nonsense is ignored, never an error
    for q in ("from=banana", "to=2026-13-45", "page=abc", "household=zzz&c_f1=x&c_f9=y&status=NOPE", "q=" + "x" * 500):
        assert client.get(f"/b/{book}?{q}", headers=MANAGER).status_code == 200, q


def test_search_treats_wildcards_as_text(client, db):
    book = seed_list(db)
    get = lambda q: names_in(client.get(f"/b/{book}/export.csv", params={"q": q}, headers=MANAGER).content.decode("utf-8-sig"))
    assert get("%") == ["Giảm 50% giá_trị"]
    assert get("_") == ["Giảm 50% giá_trị"]
    assert get("50%") == ["Giảm 50% giá_trị"]
    assert get("\\") == [] and get("%%%") == []


def test_status_filter_and_column_with_approval(client, db):
    book = book_with(db, "all", "all", approval=True)
    rec(db, book, status="PENDING", note="CHO-DUYET")
    rec(db, book, status="APPROVED", note="DA-DUYET")
    rec(db, book, status="REJECTED", note="BI-TU-CHOI")
    body = client.get(f"/b/{book}", headers=MANAGER).text
    assert "Tình trạng" in body and "Chờ duyệt" in body and "Bị từ chối" in body
    only = lambda s: client.get(f"/b/{book}?status={s}", headers=MANAGER).text
    assert "Duyệt" in only("PENDING") and body.count("Đã duyệt") >= 1
    csv = lambda s: client.get(f"/b/{book}/export.csv?status={s}", headers=MANAGER).text
    assert "CHO-DUYET" in csv("PENDING") and "DA-DUYET" not in csv("PENDING")
    assert "Duyệt" not in client.get(f"/b/{book}", headers=OFFICER).text.replace("Chờ duyệt", "").replace("Đã duyệt", "")


def test_paging_edges(client, db):
    book = book_with(db, "all", "all")
    for n in range(26):
        rec(db, book, day=f"2026-10-{n + 1:02d}" if n < 26 else "2026-10-01", kg=str(n + 1000))
    first = client.get(f"/b/{book}", headers=MANAGER).text
    assert "Trang 1/2" in first and "26 dòng" in first
    assert "Trang 2/2" in client.get(f"/b/{book}?page=2", headers=MANAGER).text
    for p in ("0", "-3", "abc", ""):
        assert "Trang 1/2" in client.get(f"/b/{book}?page={p}", headers=MANAGER).text, p
    assert "Trang 2/2" in client.get(f"/b/{book}?page=999", headers=MANAGER).text
    assert "page=2" in first and "rel=\"next\"" in first
    empty = book_with(db, "all", "all")
    assert "chưa có dòng" in client.get(f"/b/{empty}", headers=MANAGER).text.lower()


# ---------- summary ----------

def months_ago(n: int) -> str:
    today = main.today()
    year, month = today.year, today.month - n
    while month < 1:
        year, month = year - 1, month + 12
    return date(year, month, 5).isoformat()


def test_summary_numbers_without_approval(client, db):
    book = book_with(db, "all", "all")
    this_month = main.today().replace(day=5).isoformat()
    rec(db, book, day=this_month, kg="10", money=100000, kind="Chè búp tươi")
    rec(db, book, day=this_month, kg="2.5", money=50000, kind="Chè già")
    rec(db, book, day=months_ago(2), kg="20", kind="Chè búp tươi")
    rec(db, book, day=months_ago(8), kg="100", kind="Chè búp tươi")  # outside the six months chart
    body = client.get(f"/b/{book}/summary", headers=MANAGER).text
    for text in ("Số dòng", ">4<", "Số ký hái tháng này", "12,5", "Số ký hái tất cả", "132,5", "Tiền công tháng này",
                 "150.000 ₫", "Số ký hái theo tháng", "Số dòng theo Loại chè", "Chè búp tươi", "Chè già"):
        assert text in body, text
    assert "20 kg" in body and "100 kg" not in body.split("theo tháng")[1].split("theo Loại chè")[0]
    assert "Chờ duyệt" not in body
    assert body.count('class="chart-bar"') >= 6 + 2


def test_summary_counts_only_approved_rows_and_shows_pending(client, db):
    book = book_with(db, "all", "all", approval=True)
    today = main.today().replace(day=5).isoformat()
    rec(db, book, day=today, kg="10", status="APPROVED")
    rec(db, book, day=today, kg="1000", status="PENDING")
    rec(db, book, day=today, kg="2000", status="REJECTED")
    body = client.get(f"/b/{book}/summary", headers=MANAGER).text
    assert "Chờ duyệt" in body and "10 kg" in body
    assert "1.000" not in body and "2.000" not in body and "3.010" not in body
    assert re.search(r"Số ký hái tất cả.*?>10 kg<", body, re.S)
    assert re.search(r"Chờ duyệt.*?>1<", body, re.S)


def test_summary_without_summary_field_charts_row_counts(client, db):
    book = add_book(db, fields=(Field("f1", "Ngày", "date", True, True), Field("f2", "Loại", "choice", options=("A", "B"))),
                    officer="all")
    add_record(db, book, {"f1": main.today().isoformat(), "f2": "A"}, entry_date=main.today())
    body = client.get(f"/b/{book}/summary", headers=OFFICER).text
    assert "Số dòng theo tháng" in body and "Số dòng theo Loại" in body
    nothing = add_book(db, name="Trống", fields=(Field("f1", "Tên", "text"),), officer="all")
    assert client.get(f"/b/{nothing}/summary", headers=OFFICER).status_code == 200


def test_list_totals_follow_the_filters(client, db):
    book = seed_list(db)
    body = client.get(f"/b/{book}?household=h2", headers=MANAGER).text
    assert "25,5" in body and "35,5" not in body


# ---------- CSV and print ----------

def test_csv_header_rows_and_formula_escaping(client, db):
    book = book_with(db, "all", "all", approval=True)
    rid = rec(db, book, name="=HYPERLINK(\"x\")", note="@cmd|' /C calc'!A0", kg="10.5", money=150000, status="PENDING")
    reply = client.get(f"/b/{book}/export.csv", headers=MANAGER)
    assert reply.status_code == 200 and reply.headers["content-type"].startswith("text/csv")
    assert 'filename="custom-books-TC-' in reply.headers["content-disposition"]
    text = reply.content.decode("utf-8-sig")
    header, row = text.strip().split("\r\n")[:2]
    assert header == "Ngày,Nông hộ,Số ký hái,Loại chè,Ghi chú,Tiền công,Người ghi,Ngày ghi,Tình trạng"
    assert "'=HYPERLINK" in row and "'@cmd" in row and "Chờ duyệt" in row and "10.5" in row and "150000" in row
    assert "10/11/2026" in row and "Nguyễn Văn An" in row
    assert reply.content.startswith(b"\xef\xbb\xbf")


def test_csv_includes_the_values_of_a_removed_field(client, db):
    book = book_with(db, "all", "all")
    rec(db, book, note="GHI-CHU-CU")
    # the manager removes "Ghi chú" (f5)
    db.execute("UPDATE books SET fields = (SELECT jsonb_agg(f) FROM jsonb_array_elements(fields) f WHERE f->>'key' <> 'f5') WHERE id = %s", (book,))
    text = client.get(f"/b/{book}/export.csv", headers=MANAGER).content.decode("utf-8-sig")
    header = text.split("\r\n")[0]
    assert "Ghi chú" not in header and "f5" in header and "GHI-CHU-CU" in text


def test_print_page_uses_the_same_filters(client, db):
    book = seed_list(db)
    body = client.get(f"/b/{book}/print?household=h1", headers=MANAGER).text
    assert "print-sheet" in body and "Chấm công hái chè" in body and "Nguyễn Văn An" in body and "Lê Thị Hoa" not in body
    assert "Ký tên" in body or "signature" in body
    assert f"/manager/apps/custom-books/b/{book}" in body
    assert "target=\"_top\"" in client.get(f"/b/{book}", headers=MANAGER).text
