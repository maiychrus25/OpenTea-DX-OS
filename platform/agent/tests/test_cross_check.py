# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A13 (cross-check): R1 pesticide advanced but no spraying, R2 fresh leaf weighed above the area norm."""
from datetime import date

import pytest

from dxos_agent.agents.cross_check import DEFAULT_THRESHOLDS, advance_alerts, norm_alerts
from dxos_agent.settings import AgentSettings

TODAY = date(2026, 11, 28)
PARCELS = [
    {"id": "pa1", "parcel_code": "TC-A1", "household_id": "hh1", "area_ha": 1.0, "status": "TENDING",
     "harvest_approved_at": None, "updated_at": "2026-11-01T00:00:00+00:00"},
    {"id": "pa2", "parcel_code": "TC-A2", "household_id": "hh1", "area_ha": 0.5, "status": "TENDING",
     "harvest_approved_at": None, "updated_at": "2026-11-01T00:00:00+00:00"},
    {"id": "pb1", "parcel_code": "TC-B1", "household_id": "hh2", "area_ha": 2.0, "status": "TENDING",
     "harvest_approved_at": None, "updated_at": "2026-11-01T00:00:00+00:00"},
]
ITEMS = [
    {"id": "it_prod", "kind": "PESTICIDE", "pesticide_product_id": "pp1", "active": True},
    {"id": "it_free", "kind": "PESTICIDE", "pesticide_product_id": None, "active": True},
    {"id": "it_fert", "kind": "FERTILIZER", "pesticide_product_id": None, "active": True},
]


def advance(item_id="it_prod", on="2026-11-10", status="VALID", household="hh1", advance_id="adv1"):
    return {"id": advance_id, "household_id": household, "item_id": item_id, "quantity": 2,
            "advanced_on": on, "status": status, "settlement_id": None}


def spraying(parcel_id="pa2", day="2026-11-12", status="APPROVED", product="pp1", entry_id="je1"):
    return {"id": entry_id, "parcel_id": parcel_id, "entry_date": f"{day}T03:00:00+00:00", "activity_type": "SPRAYING",
            "status": status, "notes": None, "updated_at": f"{day}T04:00:00+00:00",
            "activities": [{"id": f"{entry_id}-a", "pesticide_product_id": product}]}


def ticket(kg, ticket_id="t1", parcel="pa1", cycle="cy1", day="2026-11-20", status="VALID"):
    return {"id": ticket_id, "household_id": "hh1", "parcel_id": parcel, "cycle_id": cycle,
            "weighed_at": f"{day}T02:00:00+00:00", "net_kg": kg, "status": status}


def r1(advances, sprayings=(), items=ITEMS, alerted=(), thresholds=None):
    return advance_alerts(advances, items, sprayings, PARCELS, TODAY, thresholds, alerted)


def r2(tickets, alerted=(), thresholds=None, parcels=PARCELS):
    return norm_alerts(tickets, parcels, alerted, TODAY, thresholds)


def test_defaults_are_the_owner_decisions():
    assert DEFAULT_THRESHOLDS == {
        "grace_days": 10, "fresh_norm_kg_per_ha_flush": 1800, "norm_tolerance": 1.35, "realert_extra": 0.2,
    }


def test_float_thresholds_can_be_overridden_by_the_web():
    settings = AgentSettings.from_payload({"agents": {"cross-check": {"thresholds": {"norm_tolerance": 1.5, "grace_days": "x"}}}})
    assert settings.thresholds_for("cross-check") == {**DEFAULT_THRESHOLDS, "norm_tolerance": 1.5}


# --- R1 ---------------------------------------------------------------------------------------------------------------


def test_r1_alerts_once_grace_has_passed_without_spraying():
    (item,) = r1([advance()])
    assert item.kind == "notification.internal"
    assert item.payload == {
        "template": "advance_without_spraying",
        "slots": {"household_id": "hh1", "parcel_codes": ["TC-A1", "TC-A2"], "advanced_on": "2026-11-10", "grace_days": 10},
        "subjects": ["cross-check:advance:adv1"],
    }
    assert item.reason_vi == (
        "Hộ có thửa TC-A1, TC-A2 nhận vật tư thuốc ngày 10/11/2026 nhưng chưa ghi nhật ký phun sau 10 ngày. Cán bộ kiểm tra giúp."
    )
    assert [row["table"] for row in item.evidence["rows"]] == ["input_advances"]


def test_r1_waits_until_the_grace_period_is_over():
    assert r1([advance(on="2026-11-18")]) == []  # day 10 is still inside the grace
    assert len(r1([advance(on="2026-11-17")])) == 1


def test_r1_household_without_parcels_is_named_by_id():
    (item,) = r1([advance(household="hh9")])
    assert item.payload["slots"]["parcel_codes"] == []
    assert item.reason_vi.startswith("Hộ mã hh9 nhận")


def test_r1_spraying_on_another_parcel_of_the_same_household_clears_it():
    assert r1([advance()], [spraying(parcel_id="pa2")]) == []


def test_r1_spraying_on_another_household_does_not_clear_it():
    assert len(r1([advance()], [spraying(parcel_id="pb1")])) == 1


@pytest.mark.parametrize("day", ["2026-11-09", "2026-11-21"])
def test_r1_spraying_outside_the_window_does_not_clear_it(day):
    assert len(r1([advance()], [spraying(day=day)])) == 1


@pytest.mark.parametrize("day", ["2026-11-10", "2026-11-20"])
def test_r1_window_bounds_are_inclusive(day):
    assert r1([advance()], [spraying(day=day)]) == []


@pytest.mark.parametrize("status", ["DRAFT", "REJECTED"])
def test_r1_draft_and_rejected_sprayings_never_clear_an_alert(status):
    assert len(r1([advance()], [spraying(status=status)])) == 1


@pytest.mark.parametrize("status", ["PENDING_APPROVAL", "REQUEST_CHANGES", "APPROVED"])
def test_r1_other_spraying_statuses_clear_it(status):
    assert r1([advance()], [spraying(status=status)]) == []


def test_r1_a_different_product_does_not_clear_it():
    assert len(r1([advance()], [spraying(product="pp2")])) == 1


def test_r1_item_without_a_product_is_cleared_by_any_spraying():
    assert r1([advance(item_id="it_free")], [spraying(product="pp2")]) == []
    assert r1([advance(item_id="it_free")], [spraying(product=None)]) == []


def test_r1_item_with_a_product_is_not_cleared_by_a_spraying_without_activities():
    bare = {**spraying(), "activities": []}
    assert len(r1([advance()], [bare])) == 1


def test_r1_voided_advance_never_alerts():
    assert r1([advance(status="VOIDED")]) == []


def test_r1_only_pesticide_items_are_checked():
    assert r1([advance(item_id="it_fert"), advance(item_id="missing", advance_id="adv2")]) == []


def test_r1_an_advance_already_alerted_is_not_alerted_again():
    assert r1([advance()], alerted={"cross-check:advance:adv1"}) == []


def test_r1_grace_days_is_editable():
    assert r1([advance(on="2026-11-20")], thresholds={"grace_days": 5}) != []
    assert r1([advance(on="2026-11-10")], thresholds={"grace_days": 30}) == []


# --- R2 ---------------------------------------------------------------------------------------------------------------


def test_r2_alerts_when_a_flush_is_weighed_above_the_norm():
    (item,) = r2([ticket(1500, "t1"), ticket(1000, "t2", day="2026-11-22")])
    assert item.kind == "notification.internal"
    assert item.payload == {
        "template": "weighing_over_norm",
        "slots": {"parcel_code": "TC-A1", "area_ha": 1.0, "kg": 2500, "norm_kg": 2430},
        "subjects": ["cross-check:norm:pa1:cy1:0"],
    }
    assert item.reason_vi == (
        "Thửa TC-A1 (1 ha) đã cân 2500 kg trong lứa này, vượt định mức 2430 kg. Kiểm tra búp gom từ thửa khác."
    )
    assert [row["table"] for row in item.evidence["rows"]] == ["parcels", "fresh_leaf_tickets", "fresh_leaf_tickets"]


def test_r2_exactly_at_the_limit_is_fine():
    assert r2([ticket(2430)]) == []


def test_r2_voided_tickets_do_not_count():
    assert r2([ticket(2000, "t1"), ticket(900, "t2", status="VOIDED")]) == []


def test_r2_flushes_are_counted_separately():
    assert r2([ticket(1500, "t1", cycle="cy1"), ticket(1500, "t2", cycle="cy2")]) == []


def test_r2_the_limit_follows_the_parcel_area():
    (item,) = r2([ticket(1300, parcel="pa2")])  # 0.5 ha: 1215 kg
    assert item.payload["slots"] == {"parcel_code": "TC-A2", "area_ha": 0.5, "kg": 1300, "norm_kg": 1215}


def test_r2_tickets_without_a_flush_are_grouped_in_a_30_day_window():
    old = ticket(2000, "t0", cycle=None, day="2026-10-20")  # outside the window
    first = ticket(1500, "t1", cycle=None, day="2026-11-05")
    second = ticket(1000, "t2", cycle=None, day="2026-11-27")
    assert r2([old, first]) == []
    (item,) = r2([old, first, second])
    assert item.payload["subjects"] == ["cross-check:norm:pa1:window:0"]
    assert item.payload["slots"]["kg"] == 2500  # the old ticket is left out


def test_r2_realerts_only_after_a_further_twenty_percent():
    over = ticket(2800)  # 2800 / 2430 = 1.152: still the first step
    assert r2([over]) != []
    assert r2([over], alerted={"cross-check:norm:pa1:cy1:0"}) == []
    higher = ticket(3000)  # 3000 / 2430 = 1.235: the second step
    (item,) = r2([higher], alerted={"cross-check:norm:pa1:cy1:0"})
    assert item.payload["subjects"] == ["cross-check:norm:pa1:cy1:1"]


def test_r2_never_alerts_a_lower_step_after_a_higher_one():
    assert r2([ticket(2500)], alerted={"cross-check:norm:pa1:cy1:1"}) == []


def test_r2_alerts_are_kept_apart_per_parcel_and_flush():
    assert len(r2([ticket(2500)], alerted={"cross-check:norm:pa1:cy2:3", "cross-check:norm:pa2:cy1:3"})) == 1


def test_r2_norm_and_tolerance_are_editable():
    assert r2([ticket(2000)], thresholds={"norm_tolerance": 1.0}) != []
    assert r2([ticket(2500)], thresholds={"fresh_norm_kg_per_ha_flush": 2000}) == []


def test_r2_a_ticket_of_an_unknown_parcel_is_ignored():
    assert r2([ticket(9000, parcel="gone")]) == []


def test_r2_a_busy_flush_still_alerts_with_the_largest_tickets_as_evidence():
    tickets = [ticket(100 + index, f"t{index:02d}") for index in range(60)]  # 60 tickets, 100..159 kg each
    (item,) = r2(tickets)
    assert item.payload["slots"]["kg"] == sum(100 + index for index in range(60))  # the total uses all 60
    rows = item.evidence["rows"]
    assert len(rows) == 49 and rows[0]["table"] == "parcels"
    kept = [row["id"] for row in rows[1:]]
    assert kept == sorted(kept)
    assert set(kept) == {f"t{index:02d}" for index in range(12, 60)}  # the 48 largest
    assert item.reason_vi.endswith("(60 phiếu; bằng chứng gồm 48 phiếu lớn nhất)")



def test_timestamp_filters_match_hasuras_column_types():
    """entry_date and weighed_at are Postgres timestamp (UTC, no zone): a timestamptz variable is refused by Hasura."""
    from datetime import datetime, timezone

    from dxos_agent.agents import cross_check

    calls = []

    class Gateway:
        def graphql(self, query, variables=None):
            calls.append((query, variables or {}))
            return {"data": {}}

    cross_check.run_cross_check(Gateway(), datetime(2026, 11, 29, 2, 0, tzinfo=timezone.utc))
    by_op = {q.split("(")[0].split()[-1].split("{")[0]: (q, v) for q, v in calls}
    for op in (cross_check.SPRAYINGS_OPERATION, cross_check.TICKETS_OPERATION):
        query, variables = by_op[op]
        assert "$since: timestamp!" in query and "timestamptz" not in query
    # Vietnam midnight of the first day looked at, written in UTC: 60 and 45 days before 29/11/2026.
    assert by_op[cross_check.SPRAYINGS_OPERATION][1] == {"since": "2026-09-29T17:00:00Z"}
    assert by_op[cross_check.TICKETS_OPERATION][1] == {"since": "2026-10-14T17:00:00Z"}


def test_every_field_the_cross_check_agent_reads_is_open_to_the_agent_role():
    """Hasura refuses a field the agent role cannot see; a mocked gateway never would, so check the metadata."""
    import re
    from pathlib import Path

    import yaml

    from dxos_agent.agents import cross_check

    tables = Path(__file__).resolve().parents[3] / "platform" / "hasura" / "metadata" / "databases" / "default" / "tables"

    def agent_columns(file):
        doc = yaml.safe_load((tables / file).read_text(encoding="utf-8"))
        return set(next(p for p in doc["select_permissions"] if p["role"] == "agent")["permission"]["columns"])

    queries = {
        "input_advances": (cross_check.ADVANCES_QUERY, "public_input_advances.yaml"),
        "input_items": (cross_check.ITEMS_QUERY, "public_input_items.yaml"),
        "fresh_leaf_tickets": (cross_check.TICKETS_QUERY, "public_fresh_leaf_tickets.yaml"),
        "platform_agent_proposals": (cross_check.ALERTED_QUERY, "platform_agent_proposals.yaml"),
    }
    keywords = {"where", "order_by", "limit", "offset", "asc", "desc", "true", "false"}
    for root, (query, file) in queries.items():
        rest = query.split(root, 1)[1].strip()
        args = ""
        if rest.startswith("("):
            depth, end = 0, 0
            for i, ch in enumerate(rest):
                depth += ch == "("
                depth -= ch == ")"
                if depth == 0:
                    end = i
                    break
            args, rest = rest[1:end], rest[end + 1:]
        filtered = {w for w in re.findall(r"\b([a-z][a-z_]*)\s*:", args) if w not in keywords}
        selection = rest[rest.index("{") + 1: rest.rindex("}")]
        selected = {w for w in re.findall(r"\b([a-z][a-z_]*)\b", selection)} - keywords
        allowed = agent_columns(file)
        assert filtered <= allowed, (root, "filter", filtered - allowed)
        assert selected <= allowed, (root, "select", selected - allowed)
