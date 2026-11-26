# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A8 (staff-tasks): rules in, `staff.task.create` proposals out, with a suggested assignee (contract C4)."""
from datetime import datetime, timezone
from typing import Any, Mapping

from dxos_agent.agents import staff_tasks
from dxos_agent.client import CoreGatewayClient

NOW = datetime(2026, 11, 27, 22, 50, tzinfo=timezone.utc)  # 05:50 on 28 November in Vietnam
TODAY = "2026-11-28"


def _source(proposal_id, kind, codes, template=None):
    return {
        "id": proposal_id,
        "kind": kind,
        "template": template,
        "parcels": [{"id": f"pc-{code}", "code": code} for code in codes],
        "evidence_row": {"table": "agent_proposals", "id": proposal_id, "sha256": "a" * 64},
    }


def _staff(ref, name, department=None):
    return {"staff_ref": ref, "name": name, "department": department}


class FakeGateway:
    def __init__(self, inputs: Mapping[str, Any]) -> None:
        self._inputs = inputs
        self.proposals: list[dict[str, Any]] = []
        self.runs: list[dict[str, Any]] = []

    def get_staff_inputs(self) -> Mapping[str, Any]:
        return self._inputs

    def start_run(self, **kwargs):
        self.runs.append(kwargs)
        return "run-1"

    def finish_run(self, run_id, status, **kwargs):
        self.runs.append({"id": run_id, "status": status})

    def submit_proposal(self, proposal):
        self.proposals.append(dict(proposal))
        return {"id": f"p-{len(self.proposals)}", "deduped": False}


def _run(inputs):
    gateway = FakeGateway(inputs)
    result = staff_tasks.run_staff_tasks(gateway, NOW)
    return gateway, result


def test_a_harvest_a_dry_soil_warning_and_an_inspection_each_make_a_task_due_today():
    gateway, run = _run({
        "proposals": [
            _source("h1", "harvest.approve", ["TC-01"]),
            _source("d1", "disease.inspection", ["TC-02"]),
            _source("w1", "notification.households", ["TC-03"], template="dry_soil"),
        ],
        "roster": [_staff("s1", "An")],
        "attendance": None,
    })

    assert run.submitted == 3
    by_title = {p["payload"]["title_vi"]: p for p in gateway.proposals}
    assert set(by_title) == {"Hái chè thửa TC-01", "Kiểm tra bệnh quanh thửa TC-02", "Tưới thửa TC-03"}
    harvest = by_title["Hái chè thửa TC-01"]
    assert harvest["kind"] == "staff.task.create"
    assert harvest["agent"] == "staff-tasks"
    assert harvest["payload"] == {
        "title_vi": "Hái chè thửa TC-01",
        "parcel_id": "pc-TC-01",
        "due_date": TODAY,
        "assignee_ref": "s1",
        "source": {"kind": "harvest.approve", "proposal_id": "h1"},
    }
    assert harvest["evidence"]["rows"][0]["id"] == "h1"
    assert harvest["reason_vi"]


def test_other_notification_templates_and_kinds_make_no_task():
    gateway, run = _run({
        "proposals": [
            _source("n1", "notification.households", ["TC-01"], template="rain_after_spray"),
            _source("b1", "bulletin.publish", []),
        ],
        "roster": [_staff("s1", "An")],
    })
    assert run is None and gateway.proposals == [] and gateway.runs == []


def test_at_most_ten_tasks_and_harvests_come_first():
    sources = [_source(f"w{i}", "notification.households", [f"TC-{i:02d}"], template="dry_soil") for i in range(9)]
    sources += [_source(f"h{i}", "harvest.approve", [f"HV-{i:02d}"]) for i in range(4)]
    gateway, run = _run({"proposals": sources, "roster": [_staff("s1", "An")]})

    assert run.submitted == 10
    titles = [p["payload"]["title_vi"] for p in gateway.proposals]
    assert sum(t.startswith("Hái chè") for t in titles) == 4


def test_the_assignee_is_the_active_member_with_the_fewest_tasks_suggested_today():
    gateway, _ = _run({
        "proposals": [_source(f"h{i}", "harvest.approve", [f"TC-0{i}"]) for i in range(1, 5)],
        "roster": [_staff("s2", "Bình"), _staff("s1", "An")],
    })
    assignees = [p["payload"]["assignee_ref"] for p in gateway.proposals]
    assert assignees == ["s1", "s2", "s1", "s2"]  # ties go to the lower staff_ref


def test_an_inactive_member_is_never_suggested():
    gateway, _ = _run({
        "proposals": [_source("h1", "harvest.approve", ["TC-01"])],
        "roster": [{**_staff("s1", "An"), "active": False}, _staff("s2", "Bình")],
    })
    assert gateway.proposals[0]["payload"]["assignee_ref"] == "s2"


def test_an_inspection_prefers_the_technical_department():
    gateway, _ = _run({
        "proposals": [_source("d1", "disease.inspection", ["TC-01"]), _source("h1", "harvest.approve", ["TC-02"])],
        "roster": [_staff("s1", "An", "Sản xuất"), _staff("s2", "Bình", "Kỹ thuật")],
    })
    by_kind = {p["payload"]["source"]["kind"]: p["payload"]["assignee_ref"] for p in gateway.proposals}
    assert by_kind["disease.inspection"] == "s2"
    assert by_kind["harvest.approve"] == "s1"  # s2 already has a task today


def test_an_inspection_without_technical_staff_goes_to_anyone_active():
    gateway, _ = _run({
        "proposals": [_source("d1", "disease.inspection", ["TC-01"])],
        "roster": [_staff("s1", "An", "Sản xuất")],
    })
    assert gateway.proposals[0]["payload"]["assignee_ref"] == "s1"


def test_no_active_staff_means_no_proposal_and_an_info_log(caplog):
    caplog.set_level("INFO", logger="dxos_agent")
    for roster in ([], [{**_staff("s1", "An"), "active": False}]):
        gateway, run = _run({"proposals": [_source("h1", "harvest.approve", ["TC-01"])], "roster": roster})
        assert run is None and gateway.proposals == [] and gateway.runs == []
    assert "no active staff member" in caplog.text


def test_a_source_with_several_parcels_is_one_task_without_a_parcel_id():
    gateway, _ = _run({
        "proposals": [_source("w1", "notification.households", ["TC-01", "TC-02"], template="dry_soil")],
        "roster": [_staff("s1", "An")],
    })
    payload = gateway.proposals[0]["payload"]
    assert payload["title_vi"] == "Tưới thửa TC-01, TC-02" and "parcel_id" not in payload


def test_a_source_without_a_parcel_is_skipped_and_a_missing_evidence_row_gives_empty_evidence():
    gateway, run = _run({
        "proposals": [
            _source("h0", "harvest.approve", []),
            {**_source("h1", "harvest.approve", ["TC-01"]), "evidence_row": None},
        ],
        "roster": [_staff("s1", "An")],
    })
    assert run.submitted == 1
    assert gateway.proposals[0]["evidence"]["rows"] == []


def test_the_title_stays_within_120_characters():
    codes = [f"PARCEL-{i:03d}" for i in range(30)]
    gateway, _ = _run({"proposals": [_source("w1", "notification.households", codes, template="dry_soil")], "roster": [_staff("s1", "An")]})
    assert len(gateway.proposals[0]["payload"]["title_vi"]) <= 120


def test_the_client_reads_the_staff_inputs_from_the_agent_route():
    calls = []

    def urlopen(req, timeout):
        del timeout
        calls.append((req.get_method(), req.full_url))
        import io, json
        return io.BytesIO(json.dumps({"data": {"proposals": [], "roster": [], "attendance": None}}).encode())

    gateway = CoreGatewayClient("http://gateway", lambda: "token", urlopen_fn=urlopen)
    assert gateway.get_staff_inputs() == {"proposals": [], "roster": [], "attendance": None}
    assert calls == [("GET", "http://gateway/api/internal/agent/staff/inputs")]
