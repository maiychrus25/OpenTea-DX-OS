# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""A5 prompt contract: the output schema is exactly {"bulletin_vi": string}, named in the system message."""
from datetime import datetime, timezone
import json

from dxos_agent.agents.bulletin import BULLETIN_SCHEMA, run_bulletin
from dxos_agent.providers import ReplayProvider

NOW = datetime(2026, 11, 24, 8, 0, tzinfo=timezone.utc)
TEXT = "Giá chè xuất khẩu tháng 10 đạt 2,35 USD/kg, giá thu mua tại vườn ở mức 52.000 VND/kg theo số liệu mới nhất."


class _Gateway:
    def __init__(self) -> None:
        self.proposals: list[dict] = []

    def graphql(self, query, variables=None):
        del query, variables
        return {
            "market_data": [
                {"id": "md-1", "source": "FAOSTAT", "commodity": "Tea", "metric": "export_price", "value": 2.35,
                 "unit": "USD/kg", "period": "2026-10", "fetched_at": "2026-11-24T03:00:00+00:00"}
            ]
        }

    def start_run(self, **kwargs):
        del kwargs
        return "run-1"

    def finish_run(self, run_id, status, **kwargs):
        del run_id, status, kwargs

    def submit_proposal(self, proposal):
        self.proposals.append(dict(proposal))
        return {"id": "p-1", "deduped": False}


class _RecordingProvider(ReplayProvider):
    def __init__(self) -> None:
        super().__init__(fixtures={"default": {"bulletin_vi": TEXT}})
        self.calls: list[tuple] = []

    def _generate(self, messages, schema):
        self.calls.append((messages, schema))
        return super()._generate(messages, schema)


def test_schema_has_only_the_bulletin_key_and_is_sent_with_it():
    assert BULLETIN_SCHEMA["required"] == ["bulletin_vi"]
    assert list(BULLETIN_SCHEMA["properties"]) == ["bulletin_vi"]
    assert BULLETIN_SCHEMA["additionalProperties"] is False

    provider = _RecordingProvider()
    gateway = _Gateway()
    outcome = run_bulletin(gateway, NOW, provider)

    messages, schema = provider.calls[0]
    assert schema == BULLETIN_SCHEMA
    assert messages[0].role == "system"
    assert "bulletin_vi" in messages[0].content
    assert outcome.status == "ok"
    assert gateway.proposals[0]["payload"]["bulletin_vi"] == TEXT


def test_user_message_carries_only_the_market_rows_and_the_commodity():
    provider = _RecordingProvider()
    run_bulletin(_Gateway(), NOW, provider)
    payload = json.loads(provider.calls[0][0][-1].content)
    assert set(payload) == {"commodity", "rows"}
    assert set(payload["rows"][0]) == {"source", "metric", "value", "unit", "period"}
