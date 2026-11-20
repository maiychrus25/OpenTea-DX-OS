# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Every tab against stubbed core answers: roles, one failing query, hostile text, CSV, print, no script, no style."""
import base64
import csv
import io
import json
import re

import pytest
import sample
from fastapi.testclient import TestClient

from htx_dashboard import core_client as cc
from htx_dashboard import main


def bearer(roles=("manager",), htx="TC", sub="kc-1"):
    claims = {"sub": sub, "name": "Quản trị TC", "htx_code": htx, "realm_access": {"roles": list(roles)}}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return {"Authorization": f"Bearer h.{payload}.s"}


MANAGER = bearer()
TABS = ["/", "/production", "/parcels", "/parcels/P-TC-001", "/health", "/lots", "/data"]
CSV = ["/production/export.csv", "/parcels/export.csv", "/health/export.csv", "/lots/export.csv", "/data/export.csv"]
PRINT = ["/production/print", "/parcels/print", "/health/print", "/lots/print", "/data/print"]


class Spy:
    """A transport that records every query and answers from the sample unless told otherwise."""

    def __init__(self, override=None):
        self.queries, self.override = [], override or {}

    def __call__(self, authorization, role, payload, timeout):
        self.queries.append(payload)
        hook = self.override.get(payload["query"])
        if hook is not None:
            return hook(payload)
        return sample.answer(payload)


@pytest.fixture
def spy(monkeypatch):
    spy = Spy()
    monkeypatch.setattr(main, "core", cc.Core(spy))
    monkeypatch.setattr(main, "now", lambda: sample.NOW)
    return spy


@pytest.fixture
def client(spy):
    return TestClient(main.app)


def use(monkeypatch, **override):
    spy = Spy(override)
    monkeypatch.setattr(main, "core", cc.Core(spy))
    monkeypatch.setattr(main, "now", lambda: sample.NOW)
    return spy


def attention(html: str) -> dict[str, int]:
    return {k: int(n) for k, n in re.findall(r'data-attention="(\w+)"[^>]*>\s*<span class="attention-count">(\d+)</span>', html)}


# ---------- every tab ----------

@pytest.mark.parametrize("path", TABS + CSV + PRINT)
def test_tab_is_ok_for_a_manager(client, path):
    assert client.get(path, headers=MANAGER).status_code == 200


@pytest.mark.parametrize("path", TABS + CSV + PRINT)
def test_other_roles_and_missing_claims_are_refused(client, spy, path):
    assert client.get(path).status_code == 401
    for roles in (("officer",), ("farmer",), ()):
        assert client.get(path, headers=bearer(roles)).status_code == 403, roles
    assert client.get(path, headers=bearer(htx="")).status_code == 403
    assert spy.queries == []  # a refused request never reaches the core


@pytest.mark.parametrize("path", TABS + PRINT)
def test_no_script_and_no_style_attribute(client, path):
    html = client.get(path, headers=MANAGER).text
    assert "<script" not in html.lower() and not re.search(r"\sstyle\s*=", html, re.I) and "<style" not in html.lower()
    assert 'lang="vi"' in html and "/dxos-app.css" in html


def test_stylesheet_is_served_under_a_hashed_name(client):
    html = client.get("/", headers=MANAGER).text
    href = re.search(r'href="/apps/htx-dashboard(/assets/dashboard\.[0-9a-f]{10}\.css)"', html).group(1)
    reply = client.get(href, headers=MANAGER)
    assert reply.status_code == 200 and reply.headers["content-type"].startswith("text/css")
    assert "immutable" in reply.headers["cache-control"]
    assert "style=" not in reply.text and "url(http" not in reply.text
    assert client.get("/assets/dashboard.0000000000.css", headers=MANAGER).status_code == 404
    assert client.get("/assets/..%2fmain.py", headers=MANAGER).status_code == 404


def test_health_check_needs_no_token(client):
    assert client.get("/healthz").status_code == 200


# ---------- overview content ----------

def test_overview_attention_rows_match_the_sample(client):
    html = client.get("/", headers=MANAGER).text
    found = attention(html)
    assert found["journal"] == 3 and found["disease"] == 3 and found["sensor"] == 2 and found["lifecycle"] == 1
    assert found["harvest_overdue"] >= 1 and found["harvest_week"] >= 1
    assert 'href="/manager/journal-approve"' in html and 'target="_top"' in html


def test_overview_strip_and_prices(client):
    html = client.get("/", headers=MANAGER).text
    assert "12" in html and "giá mô phỏng" in html and "Mô phỏng (Toàn quốc)" in html
    assert "Cách tính các chỉ số" in html


def test_prices_show_vietnamese_metric_names_and_only_the_tea_query_is_sent(client, spy):
    html = client.get("/", headers=MANAGER).text
    assert "Chỉ số giá sản xuất" in html and "Giá xuất khẩu" in html
    assert "producer price index" not in html and "export price" not in html
    sent = next(q for q in spy.queries if q["query"] == cc.PRICES)
    assert '"Tea"' in sent["query"] and "_neq" not in sent["query"]


def test_no_tea_price_shows_the_empty_state(monkeypatch):
    use(monkeypatch, **{cc.PRICES: lambda p: {"data": {"market_data": []}}})
    assert "Chưa có dữ liệu giá" in TestClient(main.app).get("/", headers=MANAGER).text


def test_data_tab_asks_two_columns_with_a_limit_that_fits_and_says_when_cut(monkeypatch):
    spy = use(monkeypatch)
    TestClient(main.app).get("/data", headers=MANAGER)
    sent = next(q for q in spy.queries if q["query"] == cc.DAILY_TOTALS)
    assert sent["variables"]["limit"] == cc.HOT_LIMIT == 50000 and "{ day reading_count }" in cc.DAILY_TOTALS
    monkeypatch.setattr(cc, "HOT_LIMIT", 3)
    html = TestClient(main.app).get("/data", headers=MANAGER).text
    assert "chỉ tính trên 3 dòng mới nhất của số đo theo ngày" in html.lower()


def test_calm_cooperative_says_nothing_needs_attention(monkeypatch):
    use(monkeypatch, **{cc.JOURNALS_PENDING: lambda p: {"data": {"journal_entries": []}},
                        cc.DISEASES: lambda p: {"data": {"disease_reports": []}},
                        cc.LATEST_READINGS: lambda p: {"data": {"telemetry_sensor_readings": []}},
                        cc.RUNS: lambda p: {"data": {"telemetry_lifecycle_runs": []}},
                        cc.PARCELS: lambda p: {"data": {"parcels": []}}})
    html = TestClient(main.app).get("/", headers=MANAGER).text
    assert "Không có việc nào cần chú ý" in html and attention(html) == {}


def test_empty_cooperative_has_explaining_empty_states_not_zeros(monkeypatch):
    empty = {cc.PARCELS: lambda p: {"data": {"parcels": []}}, cc.HOUSEHOLDS: lambda p: {"data": {"households": []}},
             cc.JOURNALS: lambda p: {"data": {"journal_entries": []}}, cc.JOURNALS_PENDING: lambda p: {"data": {"journal_entries": []}},
             cc.DISEASES: lambda p: {"data": {"disease_reports": []}}, cc.LOTS: lambda p: {"data": {"lots": []}},
             cc.LATEST_READINGS: lambda p: {"data": {"telemetry_sensor_readings": []}},
             cc.DAILY_TOTALS: lambda p: {"data": {"telemetry_sensor_daily": []}}, cc.RUNS: lambda p: {"data": {"telemetry_lifecycle_runs": []}},
             cc.PRICES: lambda p: {"data": {"market_data": []}}}
    use(monkeypatch, **empty)
    client = TestClient(main.app)
    for path in TABS[:3] + TABS[4:]:
        assert client.get(path, headers=MANAGER).status_code == 200, path
    assert "Chưa có cảm biến nào gửi số đo" in client.get("/data", headers=MANAGER).text
    assert "Chưa có thửa nào" in client.get("/parcels", headers=MANAGER).text
    assert "Chưa có lô chè nào" in client.get("/lots", headers=MANAGER).text


# ---------- a failing core ----------

def test_one_failing_query_leaves_the_page_up(monkeypatch):
    def boom(payload):
        raise OSError("connection reset")
    use(monkeypatch, **{cc.LOTS: boom})
    html = TestClient(main.app).get("/", headers=MANAGER).text
    assert "Chưa lấy được dữ liệu, thử tải lại" in html
    assert attention(html)["journal"] == 3  # the other blocks are intact


def test_every_query_failing_still_renders_every_tab(monkeypatch):
    def boom(payload):
        raise OSError("down")
    use(monkeypatch, **{q: boom for q in (getattr(cc, n) for n in dir(cc) if n.isupper() and isinstance(getattr(cc, n), str)
                                          and getattr(cc, n).lstrip().startswith("query"))})
    client = TestClient(main.app)
    for path in TABS:
        reply = client.get(path, headers=MANAGER)
        assert reply.status_code == 200 and "Chưa lấy được dữ liệu" in reply.text, path
    # CSV and print have nothing to show without their table: a plain 503, never a half-empty file
    for path in CSV + PRINT:
        assert client.get(path, headers=MANAGER).status_code == 503, path


def test_malformed_core_answer_is_a_block_error(monkeypatch):
    use(monkeypatch, **{cc.DISEASES: lambda p: {"data": {"disease_reports": [{"id": 1}]}},
                        cc.LOTS: lambda p: {"errors": [{"message": "x"}]}})
    reply = TestClient(main.app).get("/", headers=MANAGER)
    assert reply.status_code == 200 and "Chưa lấy được dữ liệu, thử tải lại" in reply.text


# ---------- the parcel page ----------

@pytest.mark.parametrize("code", ["..%2f..%2fetc", "P%20X", "%3Cscript%3E", "a" * 41, "P-TC-001'", "%E2%80%AE", "P-TC-001;"])
def test_a_parcel_code_that_does_not_match_never_reaches_a_query(client, spy, code):
    assert client.get(f"/parcels/{code}", headers=MANAGER).status_code in (404, 405)
    assert spy.queries == []


def test_unknown_parcel_is_not_found(client):
    reply = client.get("/parcels/P-TC-999", headers=MANAGER)
    assert reply.status_code == 404 and "Không tìm thấy" in reply.text


def test_parcel_page_shows_latest_readings_charts_and_the_table_twin(client):
    html = client.get("/parcels/P-TC-001", headers=MANAGER).text
    assert "P-TC-001" in html and html.count('<svg class="line-chart"') == 5
    assert "Độ ẩm đất" in html and "Lượng mưa" in html
    assert "<details" in html and "role=\"img\"" in html
    assert "Nhiều mây" in html  # weather


def test_silent_sensor_is_marked_on_the_parcel_page(client):
    html = client.get("/parcels/P-TC-003", headers=MANAGER).text
    assert "Không gửi số đo" in html


def test_parcel_without_sensors_says_so(client):
    html = client.get("/parcels/P-TC-002", headers=MANAGER).text
    assert "Thửa này chưa có cảm biến nào gửi số đo" in html


def test_ninety_day_period_is_capped_for_sensors_and_says_so(client):
    html = client.get("/parcels/P-TC-001?days=90", headers=MANAGER).text
    assert "tối đa 30 ngày" in html


# ---------- period and theme ----------

def test_period_and_theme_follow_every_link_and_bad_values_are_ignored(client):
    html = client.get("/?days=7&theme=dark", headers=MANAGER).text
    assert 'data-theme="dark"' in html
    switch = re.search(r'<nav class="period-nav".*?</nav>', html, re.S).group(0)  # these links change the period on purpose
    assert 'aria-current="true">7 ngày' in switch and all("theme=dark" in l or "?" not in l for l in re.findall(r'href="([^"]*)"', switch))
    html = html.replace(switch, "")
    links = re.findall(r'<a [^>]*href="(/apps/htx-dashboard[^"]*)"', html)
    inner = [l for l in links if "/assets/" not in l]
    assert all("days=7" in l and "theme=dark" in l for l in inner), [l for l in inner if "days=7" not in l or "theme=dark" not in l]
    bad = client.get("/?days=999&theme=%22%3E%3Cx", headers=MANAGER).text
    assert "data-theme" not in bad and "<x" not in bad and "days=999" not in bad


def test_the_period_reaches_the_core_as_a_variable(client, spy):
    client.get("/?days=7", headers=MANAGER)
    since = [q["variables"]["since"] for q in spy.queries if q["query"] == cc.JOURNALS][0]
    assert cc.parse_ts(since).astimezone(main.metrics.VN).strftime("%Y-%m-%d %H:%M") == "2026-11-14 00:00"


def test_every_telemetry_query_carries_the_cooperative_from_the_token(client, spy):
    client.get("/", headers=MANAGER)
    client.get("/data", headers=MANAGER)
    client.get("/parcels/P-TC-001", headers=MANAGER)
    telemetry = [q for q in spy.queries if "telemetry_" in q["query"]]
    assert telemetry and all(q["variables"]["htx"] == "TC" for q in telemetry)
    client.get("/data", headers=bearer(htx="LB"))
    assert {q["variables"]["htx"] for q in spy.queries if "telemetry_" in q["query"]} == {"TC", "LB"}


# ---------- hostile text ----------

HOSTILE = '<img src=x onerror=alert(1)>'
FORMULA = '=HYPERLINK("http://evil.example","x")'


def hostile(monkeypatch, name):
    def parcels(payload):
        data = sample.answer(payload)
        for row in data["data"]["parcels"]:
            row["household"]["name"] = name
        return data

    def journals(payload):
        data = sample.answer(payload)
        for row in data["data"]["journal_entries"]:
            row["parcel"]["household"]["name"] = name
            row["performed_by"] = name
        return data

    def diseases(payload):
        data = sample.answer(payload)
        for row in data["data"]["disease_reports"]:
            row["household"]["name"] = name
            row["ai_disease_name"] = name
        return data

    return use(monkeypatch, **{cc.PARCELS: parcels, cc.PARCEL_ONE: parcels, cc.JOURNALS: journals,
                               cc.PARCEL_JOURNALS: journals, cc.DISEASES: diseases, cc.PARCEL_DISEASES: diseases})


@pytest.mark.parametrize("path", ["/production", "/parcels", "/parcels/P-TC-001", "/health", "/"])
def test_hostile_household_name_renders_as_text(monkeypatch, path):
    hostile(monkeypatch, HOSTILE)
    html = TestClient(main.app).get(path, headers=MANAGER).text
    assert HOSTILE not in html and "&lt;img src=x onerror=alert(1)&gt;" in html


@pytest.mark.parametrize("path", CSV)
def test_hostile_text_is_neutralised_in_csv(monkeypatch, path):
    hostile(monkeypatch, FORMULA)
    reply = TestClient(main.app).get(path, headers=MANAGER)
    body = reply.content.decode("utf-8-sig")
    assert reply.status_code == 200 and "\r\n" in body
    cells = [c for row in csv.reader(io.StringIO(body)) for c in row]
    assert not any(c.startswith("=") for c in cells)


# ---------- CSV and print ----------

@pytest.mark.parametrize("path", CSV)
def test_csv_has_bom_crlf_and_an_attachment_name(client, path):
    reply = client.get(path, headers=MANAGER)
    assert reply.content.startswith("﻿".encode()) and b"\r\n" in reply.content
    assert re.fullmatch(r'attachment; filename="htx-dashboard-TC-[a-z-]+-2026-11-20\.csv"', reply.headers["content-disposition"])


@pytest.mark.parametrize("path", PRINT)
def test_print_page_opens_outside_the_frame_with_a_way_back(client, path):
    html = client.get(path, headers=MANAGER).text
    assert 'class="print-sheet"' in html and "/manager/apps/htx-dashboard" in html and "Quay lại ứng dụng" in html


@pytest.mark.parametrize("path", ["/production", "/parcels", "/health", "/lots", "/data"])
def test_each_tab_offers_csv_and_print(client, path):
    html = client.get(path, headers=MANAGER).text
    assert "Tải CSV" in html and "Bản in" in html and 'target="_top"' in html


# ---------- parcels list ----------

def test_parcel_list_paginates_filters_and_searches(client):
    html = client.get("/parcels", headers=MANAGER).text
    assert "Trang 1/2" in html and "40 dòng" in html
    page2 = client.get("/parcels?page=2", headers=MANAGER).text
    assert "Trang 2/2" in page2
    sensors = client.get("/parcels?sensor=1", headers=MANAGER).text
    assert "8 dòng" in sensors
    one = client.get("/parcels?q=P-TC-009", headers=MANAGER).text
    assert "1 dòng" in one and "P-TC-009" in one
    status = client.get("/parcels?status=DRAFT", headers=MANAGER).text
    assert "P-TC-006" in status and "P-TC-001<" not in status
    assert "Trang 1/1" in client.get("/parcels?page=99&q=P-TC-009", headers=MANAGER).text


def test_search_text_is_escaped_and_never_a_query(client, spy):
    html = client.get('/parcels?q=%22%3E%3Cscript%3Ealert(1)%3C/script%3E', headers=MANAGER).text
    assert "<script" not in html.lower()
    assert all("alert" not in json.dumps(q) for q in spy.queries)


# ---------- caps ----------

def test_a_capped_list_says_so(monkeypatch, client):
    monkeypatch.setattr(cc, "LIMIT", 3)
    monkeypatch.setattr(main.metrics, "LIST_LIMIT", 3)
    html = client.get("/health", headers=MANAGER).text
    assert "chỉ tính trên 3 dòng mới nhất" in html.lower()


def test_a_formula_in_a_household_name_gets_a_leading_quote_in_the_parcel_csv(monkeypatch):
    hostile(monkeypatch, FORMULA)
    body = TestClient(main.app).get("/parcels/export.csv", headers=MANAGER).content.decode("utf-8-sig")
    assert "'=HYPERLINK" in body


# ---------- 0.2.0: the charts of each tab are drawn on the server, and every chart has its numbers as text ----------

@pytest.mark.parametrize("path, drawn", [
    ("/", ['kpi-strip', 'class="donut', 'class="col-chart', 'class="matrix', 'class="funnel', 'class="gantt']),
    ("/production", ['class="calendar', 'class="donut', 'class="hbars', 'class="gantt', 'class="col-chart']),
    ("/parcels", ['class="donut', 'class="hbars', 'class="spark']),
    ("/parcels/P-TC-003", ['class="scatter', 'class="col-chart', 'class="gauge', 'class="line-chart']),
    ("/health", ['class="col-chart', 'class="donut', 'class="hbars']),
    ("/lots", ['class="funnel', 'class="col-chart', 'class="hbars']),
    ("/data", ['class="line-chart', 'class="col-chart', 'class="hbars', 'class="matrix', 'class="ring']),
])
def test_each_tab_draws_its_charts_on_the_server(client, path, drawn):
    html = client.get(path, headers=MANAGER).text
    for marker in drawn:
        assert marker in html, marker
    assert "<script" not in html and 'style="' not in html


def test_the_calendar_has_its_total_as_text(client):
    assert "Tổng 71 nhật ký trong 30 ngày" in client.get("/production", headers=MANAGER).text


def test_empty_cooperative_says_so_on_every_chart(monkeypatch):
    empty = {cc.PARCELS: lambda p: {"data": {"parcels": []}}, cc.JOURNALS: lambda p: {"data": {"journal_entries": []}},
             cc.DISEASES: lambda p: {"data": {"disease_reports": []}}, cc.LOTS: lambda p: {"data": {"lots": []}}}
    use(monkeypatch, **empty)
    html = TestClient(main.app).get("/", headers=MANAGER).text
    assert "Chưa có thửa nào trong HTX." in html and "Chưa có lô chè nào." in html
