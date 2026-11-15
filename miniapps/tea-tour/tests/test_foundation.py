# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""0.2.0 behaviours that 1.0 keeps, rewritten to the new modules: claims, themes, codes, database role, core client."""
import json
import re
import uuid

import psycopg
import pytest
from factories import add_booking, add_departure, add_tour, bearer
from starlette.requests import Request

from tea_tour import core_client, web
from tea_tour.claims import read_claims
from tea_tour.core_client import CoreError, Household
from tea_tour.store import core

MANAGER = bearer()
FARMER = bearer(sub="kc-farmer-1", roles=("farmer",), name="Nông hộ Một")


# ---------- claims ----------

def test_claims_are_read_from_the_token_without_a_signature_check():
    claims = read_claims(bearer(sub="kc-1", htx="TC", roles=("manager", "farmer"), name="Ba")["Authorization"])
    assert (claims.sub, claims.name, claims.htx_code, claims.roles) == ("kc-1", "Ba", "TC", ("farmer", "manager"))
    for bad in (None, "", "Bearer not-a-jwt", "Basic eDp5", "Bearer a.%%%.c", "Bearer a.e30.c"):
        assert read_claims(bad) is None, bad
    odd = bearer(roles=())["Authorization"]
    assert read_claims(odd).roles == ()


def test_protected_routes_need_claims(client):
    calls = [("GET", "/"), ("GET", "/tours"), ("GET", "/guide"), ("GET", f"/media/{uuid.uuid4()}-large.jpg")]
    for method, path in calls:
        for headers in ({}, {"Authorization": "Bearer not-a-jwt"}, {"Authorization": "Basic eDp5"}):
            response = client.request(method, path, headers=headers)
            assert response.status_code == 401, (method, path, headers)
            assert "Cần đăng nhập" in response.text


# ---------- themes ----------

def test_theme_is_echoed_and_carried_by_every_link(client):
    for theme in ("light", "dark"):
        for path, headers in (("/", MANAGER), ("/tours", MANAGER), ("/guide", FARMER), ("/public/TC", {})):
            page = client.get(f"{path}?theme={theme}", headers=headers).text
            assert f'<html lang="vi" data-theme="{theme}">' in page, path
            targets = [t for t in re.findall(r'(?:action|href)="(/apps/tea-tour[^"]*)"', page) if "/assets/" not in t]
            assert all(t.endswith(f"theme={theme}") for t in targets), (path, targets)
    page = client.get("/public/TC?theme=%22%3E%3Cb%3E").text
    assert '<html lang="vi">' in page and "theme=" not in page


def request_with(query: str) -> Request:
    return Request({"type": "http", "method": "POST", "path": "/", "query_string": query.encode(), "headers": []})


def test_redirects_are_303_and_carry_the_theme():
    redirect = web.redirect(request_with("theme=dark"), "/bookings/1", booked=1)
    assert redirect.status_code == 303 and redirect.headers["location"] == "/apps/tea-tour/bookings/1?booked=1&theme=dark"
    assert web.redirect(request_with("theme=neon"), "/tours").headers["location"] == "/apps/tea-tour/tours"


# ---------- errors ----------

def test_database_outage_is_a_vietnamese_page(client, monkeypatch):
    monkeypatch.setenv("DXOS_APP_DB_URL", "postgresql://nobody:x@127.0.0.1:1/none?connect_timeout=1")
    response = client.get("/media/" + str(uuid.uuid4()) + "-large.jpg", headers=MANAGER)
    assert response.status_code == 500
    assert "Có lỗi xảy ra" in response.text and "Traceback" not in response.text and "psycopg" not in response.text


# ---------- booking codes ----------

def test_booking_code_alphabet_and_length(db):
    departure = add_departure(db, add_tour(db))
    request = core.NewBooking("TC", departure, 1, 0, "Khách", "0912345678", None, None, "key-alphabet-1")
    booking = core.create_booking(db, request, core.Actor("GUEST", "Khách"))
    assert len(booking.code) == 8 and set(booking.code) <= set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")


def test_booking_code_retries_a_taken_code(db, monkeypatch):
    departure = add_departure(db, add_tour(db))
    add_booking(db, departure, code="AAAAAAAA")
    picks = iter("A" * 8 + "B" * 8)
    monkeypatch.setattr(core.secrets, "choice", lambda alphabet: next(picks))
    request = core.NewBooking("TC", departure, 1, 0, "Khách", "0912345678", None, None, "key-retry-1")
    booking = core.create_booking(db, request, core.Actor("GUEST", "Khách"))
    assert isinstance(booking, core.Booking) and booking.code == "BBBBBBBB"


def test_booking_code_gives_up_after_five_taken_codes(db, monkeypatch):
    departure = add_departure(db, add_tour(db))
    add_booking(db, departure, code="AAAAAAAA")
    monkeypatch.setattr(core.secrets, "choice", lambda alphabet: "A")
    request = core.NewBooking("TC", departure, 1, 0, "Khách", "0912345678", None, None, "key-giveup-1")
    with pytest.raises(psycopg.errors.UniqueViolation):
        core.create_booking(db, request, core.Actor("GUEST", "Khách"))
    assert db.execute("SELECT count(*) FROM bookings").fetchone()[0] == 1  # nothing half-written


# ---------- database role ----------

def test_app_role_cannot_read_core_tables(db):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        db.execute("SELECT 1 FROM platform.installed_apps LIMIT 1")


def test_a_booking_must_belong_to_a_departure_of_its_cooperative(db):
    departure = add_departure(db, add_tour(db))
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        add_booking(db, departure, htx="LB")


def test_party_size_stays_a_readable_column(db):
    booking = add_booking(db, add_departure(db, add_tour(db)), adults=2, children=3)
    assert db.execute("SELECT party_size FROM bookings WHERE id = %s", (booking,)).fetchone()[0] == 5


# ---------- core client ----------

def test_core_client_sends_bearer_and_manager_role(monkeypatch):
    sent = {}

    class Reply:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self):
            return json.dumps({"data": {"households": [{"id": "h1", "name": "Hộ ông Ba", "keycloak_user_id": "kc-1"}]}}).encode()

    def fake_urlopen(request, timeout):
        sent.update(url=request.full_url, headers=dict(request.header_items()), timeout=timeout,
                    body=json.loads(request.data))
        return Reply()

    monkeypatch.setattr(core_client.urllib.request, "urlopen", fake_urlopen)
    assert core_client.list_households("Bearer t") == [Household("h1", "Hộ ông Ba", "kc-1")]
    assert sent["url"] == "http://apisix:9081/api/data/graphql" and sent["timeout"] == 5
    assert sent["headers"]["Authorization"] == "Bearer t" and sent["headers"]["X-hasura-role"] == "manager"
    assert "households" in sent["body"]["query"]

    for reply in (b'{"errors": [{"message": "x"}]}', b"not json", b'{"data": {"households": [{"id": 1}]}}'):
        monkeypatch.setattr(Reply, "read", lambda self, reply=reply: reply)
        with pytest.raises(CoreError):
            core_client.list_households("Bearer t")

    def refused(request, timeout):
        raise core_client.urllib.error.URLError("connection refused")

    monkeypatch.setattr(core_client.urllib.request, "urlopen", refused)
    with pytest.raises(CoreError):
        core_client.list_households("Bearer t")
