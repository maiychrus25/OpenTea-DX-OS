# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import appkit  # noqa: E402


def test_page_of_clamps():
    assert appkit.page_of(None, 100).number == 1
    assert appkit.page_of("0", 100).number == 1
    assert appkit.page_of("-3", 100).number == 1
    assert appkit.page_of("abc", 100).number == 1
    assert appkit.page_of("999999", 100).number == 4
    empty = appkit.page_of("5", 0)
    assert (empty.number, empty.pages, empty.offset, empty.has_prev, empty.has_next) == (1, 1, 0, False, False)
    mid = appkit.page_of("2", 87)
    assert (mid.pages, mid.offset, mid.has_prev, mid.has_next, mid.size) == (4, 25, True, True, 25)
    assert appkit.page_of("4", 87).has_next is False
    assert appkit.page_of("2", 30, size=10).offset == 10


def test_parse_date_and_int():
    assert appkit.parse_date("2026-11-13") == date(2026, 11, 13)
    for bad in (None, "", "2026-13-01", "13/11/2026", "2026-1-1", " 2026-11-13", "2026-11-13x", "２０２６-11-13"):
        assert appkit.parse_date(bad) is None
    assert appkit.parse_int("5", 1, 10) == 5
    for bad in (None, "", "x", "0", "11", "1.5", "-1"):
        assert appkit.parse_int(bad, 1, 10) is None


def test_like_pattern_escapes_wildcards():
    assert appkit.like_pattern("abc") == "%abc%"
    assert appkit.like_pattern("50%_\\x") == "%50\\%\\_\\\\x%"
    assert appkit.like_pattern("a'b;") == "%a'b;%"


def test_formats():
    assert appkit.money(9000) == "9.000 ₫"
    assert appkit.money(0) == "0 ₫"
    assert appkit.money(1234567) == "1.234.567 ₫"
    assert appkit.number(Decimal("12.50")) == "12,5"
    assert appkit.number(8) == "8"
    assert appkit.number(Decimal("8.00")) == "8"
    assert appkit.number(Decimal("1234.567"), 2) == "1.234,57"
    assert appkit.vn_date(date(2026, 11, 13)) == "13/11/2026"
    assert appkit.vn_date(datetime(2026, 11, 13, 20, 0, tzinfo=timezone.utc)) == "14/11/2026"
    assert appkit.vn_datetime(datetime(2026, 11, 13, 1, 11, tzinfo=timezone.utc)) == "13/11/2026 08:11"


def test_chart_rows():
    rows = appkit.chart_rows([("A", Decimal("10")), ("B", Decimal("2.5")), ("C", 0)])
    assert [(r.label, r.value, r.percent) for r in rows] == [("A", "10", 100), ("B", "2,5", 25), ("C", "0", 0)]
    assert [r.percent for r in appkit.chart_rows([("A", 0), ("B", 0)])] == [0, 0]
    assert appkit.chart_rows([]) == []
    assert appkit.chart_rows([("A", 3)], fmt=appkit.money)[0].value == "3 ₫"


def test_csv_filename_is_ascii():
    name = appkit.csv_filename("tea-shop", "TC", "đơn hàng", date(2026, 11, 13))
    assert name == "tea-shop-TC-don-hang-2026-11-13.csv"
    assert name.isascii()
    assert appkit.csv_filename("a", "H/../X", "!!", date(2026, 1, 2)).isascii()


def test_csv_response():
    res = appkit.csv_response("a.csv", ["Mã", "Tên"], [("1", "Chè"), (2, None)])
    body = res.body
    assert body.startswith(b"\xef\xbb\xbf")
    assert body.decode("utf-8-sig") == "Mã,Tên\r\n1,Chè\r\n2,\r\n"
    assert res.media_type.startswith("text/csv")
    assert res.headers["content-disposition"] == 'attachment; filename="a.csv"'


def test_csv_response_escapes_formula_cells():
    res = appkit.csv_response("a.csv", ["x"], [("=1+1",), ("+x",), ("-x",), ("@x",), ("\tx",), ("\rx",), (-5,), (Decimal("-2.5"),), ("ok",), ("a,b",)])
    lines = res.body.decode("utf-8-sig").split("\r\n")
    assert lines[1:] == ["'=1+1", "'+x", "'-x", "'@x", "'\tx", "\"'\rx\"", "-5", "-2.5", "ok", '"a,b"', ""]


def test_shell_url():
    assert appkit.shell_url("manager", "tea-shop", "/orders") == "/manager/apps/tea-shop/orders"
    assert appkit.shell_url("farmer", "tea-tour") == "/farmer/apps/tea-tour/"


def _bearer(**claims):
    import base64
    import json

    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"Bearer h.{payload}.s"


USER = {"sub": "kc-user", "name": "Tên", "htx_code": "TC", "realm_access": {"roles": ["manager"]}}
ACTING = {"x-dxos-acting-sub": "kc-approver", "x-dxos-acting-role": "manager", "x-dxos-acting-htx": "LB"}


def test_read_claims_plain_token():
    claims = appkit.read_claims(_bearer(**USER), ACTING)  # forged headers next to a user token are ignored
    assert (claims.sub, claims.htx_code, claims.roles, claims.name) == ("kc-user", "TC", ("manager",), "Tên")
    assert appkit.read_claims(None, {}) is None
    assert appkit.read_claims("Bearer nope", {}) is None
    assert appkit.read_claims(_bearer(sub=""), {}) is None


def test_read_claims_acting_person():
    actor = _bearer(sub="service-account-dxos-apps-actor", azp="dxos-apps-actor", realm_access={"roles": ["manager", "agent"]})
    claims = appkit.read_claims(actor, ACTING)
    assert (claims.sub, claims.htx_code, claims.roles) == ("kc-approver", "LB", ("manager",))
    officer = appkit.read_claims(actor, {**ACTING, "X-DXOS-Acting-Role": "officer"})  # header names are case-insensitive
    assert officer.roles == ("officer",)


def test_read_claims_acting_headers_must_be_valid():
    actor = _bearer(sub="svc", azp="dxos-apps-actor")
    for bad in ({"x-dxos-acting-role": "agent"}, {"x-dxos-acting-role": "farmer"}, {"x-dxos-acting-role": ""},
                {"x-dxos-acting-sub": ""}, {"x-dxos-acting-htx": "bad htx!"}, {"x-dxos-acting-htx": ""}):
        assert appkit.read_claims(actor, {**ACTING, **bad}) is None
    assert appkit.read_claims(actor, {}) is None  # the service account alone is nobody
    other = _bearer(**USER, azp="dxos-web")
    assert appkit.read_claims(other, ACTING).sub == "kc-user"
