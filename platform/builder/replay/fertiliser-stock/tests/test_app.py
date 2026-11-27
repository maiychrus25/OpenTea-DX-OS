# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from conftest import bearer
from fertiliser_stock import main, store


@pytest.fixture
def client(db):
    return TestClient(main.app, follow_redirects=False)


def add(db, product="NPK", kind="in", quantity="100", htx="TC"):
    store.add_movement(db, htx, product, kind, Decimal(quantity), "", "someone")


def test_healthz_needs_no_token(client):
    response = client.get("/healthz")
    assert (response.status_code, response.text) == (200, "ok")


def test_stock_page_without_token_is_401(client):
    assert client.get("/").status_code == 401
    assert client.get("/history").status_code == 401
    assert client.post("/movements", data={"product": "x"}).status_code == 401


def test_a_farmer_is_refused(client):
    farmer = bearer(roles=("farmer",))
    assert client.get("/", headers=farmer).status_code == 403
    assert client.get("/history", headers=farmer).status_code == 403
    assert client.post("/movements", headers=farmer, data={}).status_code == 403


def test_stock_page_sums_in_and_out_per_product(client, db):
    add(db, "NPK", "in", "500")
    add(db, "NPK", "out", "120.5")
    add(db, "Urê", "in", "40")
    body = client.get("/", headers=bearer()).text
    assert "NPK" in body and "379,5 kg" in body
    assert "Urê" in body


def test_stock_page_shows_only_the_own_htx(client, db):
    add(db, "Phân của LB", htx="LB")
    assert "Phân của LB" not in client.get("/", headers=bearer(htx="TC")).text
    assert "Phân của LB" in client.get("/", headers=bearer(htx="LB")).text


def test_an_empty_stock_page_says_so(client):
    assert "Chưa có lần nhập hay xuất nào" in client.get("/", headers=bearer()).text


def test_recording_an_inbound_movement_redirects_and_saves(client, db):
    response = client.post("/movements", headers=bearer(roles=("officer",)),
                           data={"product": " NPK ", "kind": "in", "quantity": "12,5", "note": "đợt 1"})
    assert response.status_code == 303
    assert response.headers["location"] == "/apps/gen-fertiliser-stock/?notice=saved"
    assert store.stock_of(db, "TC", "NPK") == Decimal("12.5")


def test_the_redirect_keeps_the_theme(client):
    response = client.post("/movements?theme=dark", headers=bearer(), data={"product": "x", "kind": "in", "quantity": "1"})
    assert response.headers["location"] == "/apps/gen-fertiliser-stock/?notice=saved&theme=dark"


@pytest.mark.parametrize("form", [
    {"product": "", "kind": "in", "quantity": "1"},
    {"product": "x", "kind": "sideways", "quantity": "1"},
    {"product": "x", "kind": "in", "quantity": "0"},
    {"product": "x", "kind": "in", "quantity": "-3"},
    {"product": "x", "kind": "in", "quantity": "1.25"},
    {"product": "x", "kind": "in", "quantity": "abc"},
    {"product": "x", "kind": "in", "quantity": "1", "note": "n" * 201},
])
def test_a_bad_form_is_refused_and_saves_nothing(client, db, form):
    response = client.post("/movements", headers=bearer(), data=form)
    assert response.status_code == 422
    assert 'role="alert"' in response.text
    assert store.count_movements(db, "TC") == 0


def test_a_bad_form_keeps_what_was_typed(client):
    response = client.post("/movements", headers=bearer(), data={"product": "NPK", "kind": "out", "quantity": "x"})
    assert 'value="NPK"' in response.text and '<option value="out" selected>' in response.text


def test_an_outbound_movement_cannot_exceed_the_stock(client, db):
    add(db, "NPK", "in", "10")
    response = client.post("/movements", headers=bearer(), data={"product": "NPK", "kind": "out", "quantity": "10.1"})
    assert response.status_code == 422
    assert "lớn hơn số đang tồn kho" in response.text
    assert store.stock_of(db, "TC", "NPK") == Decimal("10")
    ok = client.post("/movements", headers=bearer(), data={"product": "NPK", "kind": "out", "quantity": "10"})
    assert ok.status_code == 303


def test_history_lists_newest_first_and_pages(client, db):
    for n in range(25):
        add(db, f"Loại {n:02d}")
    first = client.get("/history", headers=bearer()).text
    assert "Loại 24" in first and "Loại 04" not in first and "Trang 1/2" in first
    assert "Loại 04" in client.get("/history?page=2", headers=bearer()).text


def test_an_empty_history_says_so(client):
    assert "Chưa có lần nhập hay xuất nào" in client.get("/history", headers=bearer()).text


def test_the_theme_query_sets_the_page_theme(client):
    assert '<html lang="vi" data-theme="dark">' in client.get("/?theme=dark", headers=bearer()).text
    assert "data-theme" not in client.get("/?theme=evil", headers=bearer()).text


def test_an_unknown_page_is_a_404_page(client):
    response = client.get("/nope", headers=bearer())
    assert response.status_code == 404 and 'role="alert"' in response.text
