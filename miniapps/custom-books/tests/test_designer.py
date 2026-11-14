# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import re
import uuid

import pytest
from conftest import BOOK_NAME, add_book, add_record, bearer
from fastapi.testclient import TestClient

from custom_books import book_templates, core_client, main, store
from custom_books.core_client import Household
from custom_books.fields import Field

MANAGER = bearer()
OFFICER = bearer(sub="kc-officer", roles=("officer",), name="Cán bộ")
FARMER = bearer(sub="kc-farmer-1", roles=("farmer",), name="Nông hộ Một")
HOUSEHOLDS = [Household(id="h1", name="Nguyễn Văn An", keycloak_user_id="kc-farmer-1"),
              Household(id="h2", name="Lê Thị Hoa", keycloak_user_id=None)]
PICK_FIELDS = (Field("f1", "Ngày", "date", True, True), Field("f2", "Số ký hái", "number", True, True, True, unit="kg"))
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setattr(core_client, "list_households", lambda authorization, role: HOUSEHOLDS)
    with TestClient(main.app, root_path=main.PREFIX, raise_server_exceptions=False, follow_redirects=False) as c:
        yield c


def design_form(book, **extra):
    """The form a browser posts for the saved design of a book, plus overrides."""
    from custom_books.fields import rows_of
    form = {"name": book.name, "description": book.description, "icon": book.icon,
            "officer_access": book.officer_access, "farmer_access": book.farmer_access}
    if book.approval:
        form["approval"] = "on"
    for r in rows_of(book.fields):
        form.update({f"key_{r['i']}": r["key"], f"label_{r['i']}": r["label"], f"type_{r['i']}": r["type"],
                     f"options_{r['i']}": r["options"], f"unit_{r['i']}": r["unit"], f"order_{r['i']}": r["order"]})
        for flag in ("required", "in_list", "summary"):
            if r[flag]:
                form[f"{flag}_{r['i']}"] = "on"
    form.update(extra)
    return form


def test_every_books_route_refuses_non_managers(client, db):
    book_id = add_book(db, fields=PICK_FIELDS)
    gets = ["/books", "/books/new", f"/books/{book_id}/design", f"/books/{book_id}/preview"]
    posts = ["/books", f"/books/{book_id}/design", f"/books/{book_id}/publish", f"/books/{book_id}/archive",
             f"/books/{book_id}/delete"]
    for headers in (OFFICER, FARMER):
        assert all(client.get(p, headers=headers).status_code == 403 for p in gets)
        assert all(client.post(p, headers=headers, data={"template": "picking"}).status_code == 403 for p in posts)
    assert client.get("/books").status_code == 401
    assert store.get_book(db, "TC", book_id).status == "PUBLISHED"


def test_books_list_shows_own_htx_only(client, db):
    add_book(db, name="Sổ của Tân Cương", status="DRAFT")
    add_book(db, htx="LB", name="Sổ của La Bằng")
    body = client.get("/books", headers=MANAGER).text
    assert "Sổ của Tân Cương" in body and "Sổ của La Bằng" not in body and "Tạo sổ mới" in body


def test_chooser_lists_eight_templates_and_blank(client):
    body = client.get("/books/new", headers=MANAGER).text
    for t in book_templates.TEMPLATES.values():
        assert t.name in body
    assert "Sổ trắng" in body and body.count('name="template"') == 9


@pytest.mark.parametrize("key", list(book_templates.TEMPLATES) + ["blank"])
def test_each_template_creates_a_draft_book(client, db, key):
    reply = client.post("/books", headers=MANAGER, data={"template": key})
    assert reply.status_code == 303
    book_id = uuid.UUID(UUID_RE.search(reply.headers["location"]).group())
    assert reply.headers["location"] == f"/apps/custom-books/books/{book_id}/design"
    book = store.get_book(db, "TC", book_id)
    assert book.status == "DRAFT" and book.record_count == 0
    if key != "blank":
        t = book_templates.TEMPLATES[key]
        assert book.name == t.name and book.fields == t.fields and book.approval == t.approval
    assert client.get(f"/books/{book_id}/design", headers=MANAGER).status_code == 200
    assert client.get(f"/books/{book_id}/preview", headers=MANAGER).status_code == 200


def test_unknown_template_is_refused_and_creates_nothing(client, db):
    assert client.post("/books", headers=MANAGER, data={"template": "x'; DROP TABLE books;--"}).status_code == 400
    assert client.post("/books", headers=MANAGER, data={}).status_code == 400
    assert db.execute("SELECT count(*) FROM books").fetchone()[0] == 0


def test_fifty_books_limit(client, db):
    for n in range(50):
        add_book(db, name=f"Sổ {n}", status="DRAFT")
    add_book(db, htx="LB", name="Sổ khác HTX")
    assert client.post("/books", headers=MANAGER, data={"template": "picking"}).status_code == 409
    assert db.execute("SELECT count(*) FROM books WHERE htx_code = 'TC'").fetchone()[0] == 50
    assert client.post("/books", headers=bearer(htx="LB"), data={"template": "picking"}).status_code == 303


def test_design_page_shows_fields_three_blank_rows_and_headings(client, db):
    book_id = add_book(db, fields=PICK_FIELDS, status="DRAFT")
    body = client.get(f"/books/{book_id}/design", headers=MANAGER).text
    for text in ("Thông tin sổ", "Các ô cần ghi", "Ai được dùng", "Duyệt", "Số ký hái", "Hiện trong danh sách", "Tính tổng",
                 "Lưu thiết kế", "Phát hành"):
        assert text in body
    assert 'name="label_3"' in body and 'name="label_4"' in body and 'name="label_5"' in body
    assert 'name="label_6"' not in body


def test_design_save_ok_and_new_field_gets_a_key(client, db):
    book_id = add_book(db, fields=PICK_FIELDS, status="DRAFT")
    book = store.get_book(db, "TC", book_id)
    form = design_form(book, name="Chấm công mới", label_3="Ghi chú", type_3="long_text")
    reply = client.post(f"/books/{book_id}/design", headers=MANAGER, data=form)
    assert reply.status_code == 303 and reply.headers["location"].endswith(f"/books/{book_id}/design?notice=saved")
    saved = store.get_book(db, "TC", book_id)
    assert saved.name == "Chấm công mới" and [f.key for f in saved.fields] == ["f1", "f2", "f3"] and saved.next_key == 4
    assert "Đã lưu" in client.get(f"/books/{book_id}/design?notice=saved", headers=MANAGER).text


def test_design_errors_return_400_and_keep_typed_values(client, db):
    book_id = add_book(db, fields=PICK_FIELDS, status="DRAFT")
    book = store.get_book(db, "TC", book_id)
    form = design_form(book, name="", label_1="Tên đã gõ lại", label_2="", label_3="Ô mới nhập dở", type_3="choice",
                       options_3="Chỉ một")
    reply = client.post(f"/books/{book_id}/design", headers=MANAGER, data=form)
    assert reply.status_code == 400
    assert "Tên đã gõ lại" in reply.text and "Ô mới nhập dở" in reply.text and "Chỉ một" in reply.text
    assert "field-error" in reply.text and 'aria-invalid="true"' in reply.text
    assert store.get_book(db, "TC", book_id).fields == PICK_FIELDS  # nothing was saved


def test_hostile_labels_are_stored_and_shown_as_text(client, db):
    book_id = add_book(db, fields=PICK_FIELDS, status="DRAFT")
    book = store.get_book(db, "TC", book_id)
    hostile = "x'); DROP TABLE records;--"
    form = design_form(book, label_3=hostile, label_4="<script>alert(1)</script>", type_4="choice",
                       options_4="<img src=x onerror=y>\n'; --")
    assert client.post(f"/books/{book_id}/design", headers=MANAGER, data=form).status_code == 303
    assert store.get_book(db, "TC", book_id).fields[2].label == hostile
    assert db.execute("SELECT count(*) FROM records").fetchone()[0] == 0  # the table still exists
    for url in (f"/books/{book_id}/design", f"/books/{book_id}/preview"):
        body = client.get(url, headers=MANAGER).text
        assert "<script>alert(1)</script>" not in body and "<img src=x" not in body
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in body


def test_type_is_locked_once_the_book_has_records(client, db):
    book_id = add_book(db, fields=PICK_FIELDS)
    add_record(db, book_id, {"f1": "2026-11-10", "f2": "12.5"})
    book = store.get_book(db, "TC", book_id)
    reply = client.post(f"/books/{book_id}/design", headers=MANAGER, data=design_form(book, type_2="text"))
    assert reply.status_code == 400 and "không đổi được kiểu" in reply.text
    assert store.get_book(db, "TC", book_id).fields[1].type == "number"
    # relabelling, reordering and adding a field are fine
    ok = client.post(f"/books/{book_id}/design", headers=MANAGER,
                     data=design_form(book, label_2="Ký chè", order_2="5", label_3="Ghi chú"))
    assert ok.status_code == 303
    assert [f.label for f in store.get_book(db, "TC", book_id).fields] == ["Ký chè", "Ngày", "Ghi chú"]


def test_removed_field_keeps_its_data(client, db):
    book_id = add_book(db, fields=PICK_FIELDS)
    rid = add_record(db, book_id, {"f1": "2026-11-10", "f2": "12.5"})
    book = store.get_book(db, "TC", book_id)
    assert client.post(f"/books/{book_id}/design", headers=MANAGER,
                       data=design_form(book, remove_2="on", label_4="Mới")).status_code == 303
    saved = store.get_book(db, "TC", book_id)
    assert [f.key for f in saved.fields] == ["f1", "f3"] and saved.next_key == 4  # f2 is never issued again
    assert db.execute("SELECT data FROM records WHERE id = %s", (rid,)).fetchone()[0] == {"f1": "2026-11-10", "f2": "12.5"}


def test_design_of_another_htx_is_404(client, db):
    other = add_book(db, htx="LB", fields=PICK_FIELDS)
    for method, path in (("get", "design"), ("get", "preview"), ("post", "design"), ("post", "publish"),
                         ("post", "archive"), ("post", "delete")):
        assert getattr(client, method)(f"/books/{other}/{path}", headers=MANAGER).status_code == 404
    assert store.get_book(db, "LB", other) is not None and store.get_book(db, "LB", other).status == "PUBLISHED"
    assert client.get(f"/books/{uuid.uuid4()}/design", headers=MANAGER).status_code == 404
    assert client.get("/books/not-a-uuid/design", headers=MANAGER).status_code == 404


def test_preview_shows_the_entry_form(client, db):
    book_id = add_book(db, fields=PICK_FIELDS + (Field("f3", "Nông hộ", "household"),), status="DRAFT")
    body = client.get(f"/books/{book_id}/preview", headers=MANAGER).text
    assert "Số ký hái" in body and 'name="f2"' in body and "Nguyễn Văn An" in body and "xem thử" in body.lower()


def test_publish_needs_a_field_and_archive_and_republish(client, db):
    empty = add_book(db, status="DRAFT")
    assert client.post(f"/books/{empty}/publish", headers=MANAGER).status_code == 400
    assert store.get_book(db, "TC", empty).status == "DRAFT"
    book_id = add_book(db, fields=PICK_FIELDS, status="DRAFT")
    reply = client.post(f"/books/{book_id}/publish", headers=MANAGER)
    assert reply.status_code == 303 and reply.headers["location"] == f"/apps/custom-books/b/{book_id}"
    assert store.get_book(db, "TC", book_id).status == "PUBLISHED"
    reply = client.post(f"/books/{book_id}/archive", headers=MANAGER)
    assert reply.status_code == 303 and reply.headers["location"] == "/apps/custom-books/books"
    assert store.get_book(db, "TC", book_id).status == "ARCHIVED"
    assert client.post(f"/books/{book_id}/publish", headers=MANAGER).status_code == 303  # published again
    assert client.post(f"/books/{book_id}/archive", headers=MANAGER).status_code == 303
    assert client.post(f"/books/{book_id}/archive", headers=MANAGER).status_code == 409  # not published any more


def test_delete_only_without_records(client, db):
    with_rows = add_book(db, fields=PICK_FIELDS)
    add_record(db, with_rows, {"f1": "2026-11-10"})
    assert client.post(f"/books/{with_rows}/delete", headers=MANAGER).status_code == 409
    assert store.get_book(db, "TC", with_rows) is not None
    empty = add_book(db, fields=PICK_FIELDS, status="DRAFT")
    reply = client.post(f"/books/{empty}/delete", headers=MANAGER)
    assert reply.status_code == 303 and reply.headers["location"] == "/apps/custom-books/books"
    assert store.get_book(db, "TC", empty) is None


def test_home_lists_published_books_the_role_may_use(client, db):
    add_book(db, name="Sổ cán bộ và nông dân", fields=PICK_FIELDS, officer="all", farmer="own")
    add_book(db, name="Sổ chỉ cán bộ", fields=PICK_FIELDS, officer="view", farmer="none")
    add_book(db, name="Sổ đang soạn", fields=PICK_FIELDS, status="DRAFT")
    add_book(db, htx="LB", name="Sổ La Bằng", fields=PICK_FIELDS)
    farmer, officer, manager = (client.get("/", headers=h).text for h in (FARMER, OFFICER, MANAGER))
    assert "Sổ cán bộ và nông dân" in farmer and "Sổ chỉ cán bộ" not in farmer and "/books" not in farmer
    assert "Sổ chỉ cán bộ" in officer and "Sổ đang soạn" not in officer and 'href="/apps/custom-books/books"' not in officer
    assert "Sổ đang soạn" not in manager and "Sổ La Bằng" not in manager and 'href="/apps/custom-books/books"' in manager


# ---------- feed ----------

def feed(client, headers):
    reply = client.get("/feed", headers=headers)
    assert reply.status_code == 200 and reply.headers["content-type"].startswith("application/json")
    return reply.json()


def test_feed_per_role_and_level(client, db):
    both = add_book(db, name="Cả hai", fields=PICK_FIELDS, officer="all", farmer="own", icon="leaf", description="Mô tả")
    only_officer = add_book(db, name="Chỉ cán bộ", fields=PICK_FIELDS, officer="view", farmer="none", icon="users")
    add_book(db, name="Đang soạn", fields=PICK_FIELDS, status="DRAFT")
    add_book(db, name="Ngừng dùng", fields=PICK_FIELDS, status="ARCHIVED")
    add_book(db, htx="LB", name="Của HTX khác", fields=PICK_FIELDS)
    manager = feed(client, MANAGER)
    assert {e["label"] for e in manager["entries"]} == {"Cả hai", "Chỉ cán bộ"}
    assert manager["create"] == {"label": "Tạo sổ mới", "path": "/books/new"}
    assert {"label": "Cả hai", "path": f"/b/{both}", "icon": "leaf", "description": "Mô tả"} in manager["entries"]
    officer, farmer = feed(client, OFFICER), feed(client, FARMER)
    assert {e["path"] for e in officer["entries"]} == {f"/b/{both}", f"/b/{only_officer}"}
    assert [e["path"] for e in farmer["entries"]] == [f"/b/{both}"]
    assert "create" not in officer and "create" not in farmer
    assert all(UUID_RE.fullmatch(e["path"][3:]) and e["path"] == e["path"].lower() for e in manager["entries"])
    assert client.get("/feed").status_code == 401


def test_feed_limits_label_and_count(client, db):
    add_book(db, name="N" * 80, fields=PICK_FIELDS)
    for n in range(35):
        add_book(db, name=f"Sổ {n}", fields=PICK_FIELDS)
    entries = feed(client, MANAGER)["entries"]
    assert len(entries) == 30 and all(1 <= len(e["label"]) <= 60 and len(e["description"]) <= 200 for e in entries)
    db.execute("DELETE FROM books WHERE name LIKE 'Sổ %'")
    assert feed(client, MANAGER)["entries"][0]["label"] == "N" * 60


def test_feed_newest_published_first(client, db):
    first = add_book(db, name="Sổ cũ", fields=PICK_FIELDS)
    second = add_book(db, name="Sổ mới", fields=PICK_FIELDS)
    db.execute("UPDATE books SET updated_at = now() - interval '1 day' WHERE id = %s", (first,))
    assert [e["label"] for e in feed(client, MANAGER)["entries"]] == ["Sổ mới", "Sổ cũ"]


def test_feed_without_a_role_is_refused(client):
    assert client.get("/feed", headers=bearer(roles=())).status_code == 403
