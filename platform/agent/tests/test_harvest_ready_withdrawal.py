# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Which spraying entries hold back a harvest-ready proposal: drafts and rejected ones do not."""
from datetime import datetime, timezone

import pytest

from dxos_agent.agents.harvest_ready import SPRAYINGS_QUERY, harvest_proposals

NOW = datetime(2026, 11, 28, 3, 0, tzinfo=timezone.utc)
PARCEL = {
    "id": "p1",
    "parcel_code": "TC-A3",
    "status": "TENDING",
    "harvest_approved_at": None,
    "updated_at": "2026-11-20T00:00:00+00:00",
    "crop_cycles": [
        {"id": "c1", "parcel_id": "p1", "season": "2026", "sowed_at": "2026-03-01T00:00:00+00:00",
         "estimated_harvest_date": "2026-11-30T00:00:00+00:00", "harvested_at": None}
    ],
}


def spraying(status: str, safe_harvest_date: str) -> dict:
    return {
        "id": f"e-{status}", "parcel_id": "p1", "entry_date": "2026-11-25T00:00:00+00:00", "activity_type": "SPRAYING",
        "status": status, "notes": None, "updated_at": "2026-11-25T00:00:00+00:00",
        "activities": [{"id": "a1", "activity_detail": None, "product_name": "X", "dosage": None,
                        "withdrawal_days": 7, "safe_harvest_date": safe_harvest_date}],
    }


def test_query_leaves_draft_and_rejected_out():
    assert '_nin: ["DRAFT", "REJECTED"]' in SPRAYINGS_QUERY


def test_rejected_spraying_does_not_hold_back_harvest_ready():
    future = spraying("REJECTED", "2026-12-20T00:00:00+00:00")
    assert len(harvest_proposals([PARCEL], [future], NOW)) == 1


@pytest.mark.parametrize("status", ["PENDING_APPROVAL", "REQUEST_CHANGES"])
def test_pending_and_changes_requested_spraying_still_holds_back(status):
    assert harvest_proposals([PARCEL], [spraying(status, "2026-12-20T00:00:00+00:00")], NOW) == []
