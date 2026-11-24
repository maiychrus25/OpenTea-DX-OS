# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""External LLM providers: request shapes over a fake HTTP server, redaction, fallback, budget, cost and settings."""
from datetime import datetime, time, timedelta, timezone
import json
import logging
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import pytest

from dxos_agent import __main__ as agent_main
from dxos_agent.agents.digest import DigestSchedule
from dxos_agent.agents.journal_review import AGENT_NAME, run_journal_review
from dxos_agent.config import Config
from dxos_agent.providers import AnthropicProvider, LLMMessage, OpenAIProvider, ProviderError, RateLimitError, ReplayProvider
from dxos_agent.providers.pricing import estimate_cost_usd
from dxos_agent.providers.redaction import MASK, redact_text
from dxos_agent.settings import AgentSettings, AgentChoice, choose_providers, OLLAMA

SAMPLE_SCHEMA = {
    "type": "object",
    "required": ["ok"],
    "additionalProperties": False,
    "properties": {"ok": {"type": "boolean"}},
}
ANSWER = '{"ok": true}'


class FakeAPI:
    """Local HTTP server standing in for Anthropic or OpenAI; records every request it receives."""

    def __init__(self, respond) -> None:
        self.respond = respond
        self.requests: list[dict] = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length)
                headers = {key.lower(): value for key, value in self.headers.items()}
                outer.requests.append({"path": self.path, "headers": headers, "body": raw.decode("utf-8")})
                status, payload, extra = outer.respond(self.path, json.loads(raw))
                body = json.dumps(payload).encode("utf-8")
                self.send_response(status)
                for key, value in extra.items():
                    self.send_header(key, value)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                del args

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def anthropic_api():
    def respond(path, body):
        del path, body
        return 200, {"model": "claude-haiku-5-5", "content": [{"type": "text", "text": ANSWER}], "usage": {"input_tokens": 120, "output_tokens": 15}}, {}

    api = FakeAPI(respond)
    yield api
    api.close()


def _anthropic(api: FakeAPI, **kwargs) -> AnthropicProvider:
    options = {"sleep_fn": lambda _: None, **kwargs}
    return AnthropicProvider(api_key="sk-test-key", default_model="claude-haiku-5-5", base_url=api.base_url, **options)


def test_anthropic_request_matches_the_messages_api(anthropic_api):
    provider = _anthropic(anthropic_api)
    res = provider.complete_json([LLMMessage(role="system", content="Bạn là trợ lý"), LLMMessage(role="user", content="hi")], SAMPLE_SCHEMA)

    request = anthropic_api.requests[0]
    body = json.loads(request["body"])
    assert request["path"] == "/v1/messages"
    assert request["headers"]["x-api-key"] == "sk-test-key"
    assert request["headers"]["anthropic-version"] == "2023-06-01"
    assert body["model"] == "claude-haiku-5-5"
    assert body["max_tokens"] > 0
    assert "Bạn là trợ lý" in body["system"] and '"ok"' in body["system"]
    assert [m["role"] for m in body["messages"]] == ["user"]
    assert res.data == {"ok": True}
    assert (res.provider, res.model, res.tokens_in, res.tokens_out) == ("anthropic", "claude-haiku-5-5", 120, 15)


def test_openai_request_matches_the_chat_completions_api():
    def respond(path, body):
        del path, body
        return 200, {"model": "gpt-4o-mini", "choices": [{"message": {"content": ANSWER}}], "usage": {"prompt_tokens": 9, "completion_tokens": 4}}, {}

    api = FakeAPI(respond)
    try:
        provider = OpenAIProvider(api_key="sk-openai", default_model="gpt-4o-mini", base_url=api.base_url, sleep_fn=lambda _: None)
        res = provider.complete_json([LLMMessage(role="user", content="hi")], SAMPLE_SCHEMA)
    finally:
        api.close()

    request = api.requests[0]
    body = json.loads(request["body"])
    assert request["path"] == "/v1/chat/completions"
    assert request["headers"]["authorization"] == "Bearer sk-openai"
    assert body["response_format"] == {"type": "json_object"}
    assert body["model"] == "gpt-4o-mini"
    assert res.data == {"ok": True} and res.tokens_out == 4


def test_redaction_masks_phone_email_and_identity_numbers_but_not_ids():
    note = "Gọi 0912 345 678 hoặc +84.912.345.678, email a.nong@example.com, CCCD 012345678901, CMND 123456789."
    masked = redact_text(note)
    for secret in ("0912 345 678", "912.345.678", "a.nong@example.com", "012345678901", "123456789"):
        assert secret not in masked
    assert masked.count(MASK) == 5

    # Entry ids (cuids, UUID segments with 12 digits) and quantities keep their digits.
    assert redact_text('{"entry_id": "cmh2345678901abcdef", "dosage": "1200 kg"}') == '{"entry_id": "cmh2345678901abcdef", "dosage": "1200 kg"}'
    assert redact_text("id 3f2a1b9c-0d4e-5f60-7182-123456789012") == "id 3f2a1b9c-0d4e-5f60-7182-123456789012"


def test_external_request_body_never_carries_a_phone_number_or_email(anthropic_api):
    provider = _anthropic(anthropic_api)
    provider.complete_json(
        [LLMMessage(role="user", content=json.dumps({"farmer_note": "Gọi 0912345678, a.nong@example.com"}))],
        SAMPLE_SCHEMA,
    )
    sent = anthropic_api.requests[0]["body"]
    assert "0912345678" not in sent and "a.nong@example.com" not in sent
    assert MASK in json.loads(sent)["messages"][0]["content"]


def test_external_429_opens_a_cool_down_without_a_retry(anthropic_api):
    anthropic_api.respond = lambda path, body: (429, {"error": "slow down"}, {"Retry-After": "5"})
    clock = [1000.0]
    provider = _anthropic(anthropic_api, clock=lambda: clock[0])

    with pytest.raises(RateLimitError) as exc_info:
        provider.complete_json([LLMMessage(role="user", content="hi")], SAMPLE_SCHEMA)
    assert exc_info.value.retry_after_seconds == 60.0
    assert len(anthropic_api.requests) == 1

    # Inside the window no request leaves the server.
    clock[0] += 30.0
    with pytest.raises(RateLimitError):
        provider.complete_json([LLMMessage(role="user", content="hi")], SAMPLE_SCHEMA)
    assert len(anthropic_api.requests) == 1


def test_external_server_error_is_retried_once_then_becomes_a_provider_error(anthropic_api):
    anthropic_api.respond = lambda path, body: (500, {"error": "boom"}, {})
    sleeps = []
    provider = _anthropic(anthropic_api, sleep_fn=sleeps.append)

    with pytest.raises(ProviderError) as exc_info:
        provider.complete_json([LLMMessage(role="user", content="hi")], SAMPLE_SCHEMA)
    assert "sk-test-key" not in str(exc_info.value)
    assert len(anthropic_api.requests) == 2
    assert sleeps == [2.0]


def test_unreachable_provider_falls_back_to_ollama_then_the_run_records_it(anthropic_api):
    # Spec test 8: the outbound network is cut, so the external call fails and Ollama answers the run.
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        dead_url = f"http://127.0.0.1:{probe.getsockname()[1]}"
    primary = AnthropicProvider(api_key="sk-test-key", default_model="claude-haiku-5-5", base_url=dead_url, sleep_fn=lambda _: None)
    internal = _ollama_stand_in()
    gateway = _Gateway([_pending_entry("e1", product_name="")])

    outcome = run_journal_review(gateway, primary, now=NOW, fallback=internal)

    assert outcome.used_llm is True
    run = gateway.runs_finished[-1]
    assert (run["status"], run["provider"], run["external_calls"], run["cost_estimate_usd"]) == ("ok", "ollama", 2, 0.0)
    assert gateway.proposals[0]["kind"] == "journal.reject"
    assert gateway.proposals[0]["confidence"] == 0.95


def test_successful_external_run_records_provider_tokens_and_cost(anthropic_api):
    anthropic_api.respond = lambda path, body: (
        200,
        {
            "model": "claude-haiku-5-5",
            "content": [{"type": "text", "text": json.dumps({"reject_reasons": {"e1": "Thửa TC-01: thiếu tên thuốc, đề nghị bổ sung."}})}],
            "usage": {"input_tokens": 1000, "output_tokens": 200},
        },
        {},
    )
    gateway = _Gateway([_pending_entry("e1", product_name="")])

    run_journal_review(gateway, _anthropic(anthropic_api), now=NOW, fallback=_ollama_stand_in())

    run = gateway.runs_finished[-1]
    assert (run["provider"], run["model"], run["external_calls"]) == ("anthropic", "claude-haiku-5-5", 1)
    assert (run["tokens_in"], run["tokens_out"]) == (1000, 200)
    assert run["cost_estimate_usd"] == pytest.approx((1000 * 0.10 + 200 * 0.50) / 1_000_000)


def test_unknown_model_costs_zero_and_is_logged(caplog):
    with caplog.at_level(logging.WARNING, logger="dxos_agent"):
        assert estimate_cost_usd("mystery-model", 500, 500) == 0.0
    assert "mystery-model" in caplog.text


def test_budget_exhausted_or_no_key_keeps_the_run_on_ollama():
    internal = _ollama_stand_in()
    external = AnthropicProvider(api_key="sk", default_model="claude-haiku-5-5", base_url="http://127.0.0.1:9")
    providers = {OLLAMA: internal, "anthropic": external}
    chosen = {"journal-review": AgentChoice(provider="anthropic")}

    spent = AgentSettings(agents=chosen, budget_exhausted=True)
    assert choose_providers(spent, AGENT_NAME, providers) == (internal, None)

    open_budget = AgentSettings(agents=chosen, budget_exhausted=False)
    assert choose_providers(open_budget, AGENT_NAME, providers) == (external, internal)
    assert choose_providers(open_budget, AGENT_NAME, {OLLAMA: internal}) == (internal, None)


def test_cooperative_model_overrides_the_default_and_a_missing_model_stays_on_ollama():
    internal = _ollama_stand_in()
    openai = OpenAIProvider(api_key="sk", default_model="", base_url="http://127.0.0.1:9")
    providers = {OLLAMA: internal, "openai": openai}

    no_model = AgentSettings(agents={AGENT_NAME: AgentChoice(provider="openai")}, budget_exhausted=False)
    assert choose_providers(no_model, AGENT_NAME, providers) == (internal, None)

    with_model = AgentSettings(agents={AGENT_NAME: AgentChoice(provider="openai", model="gpt-4o-mini")}, budget_exhausted=False)
    chosen, fallback = choose_providers(with_model, AGENT_NAME, providers)
    assert (chosen.model, fallback) == ("gpt-4o-mini", internal)


def test_settings_payload_with_bad_values_falls_back_to_safe_defaults():
    settings = AgentSettings.from_payload(
        {
            "agents": {"journal-review": {"provider": "carrier-pigeon", "model": "  "}, "digest": "not-a-dict"},
            "report_time": "25:99",
        }
    )
    assert settings.choice_for("journal-review") == AgentChoice(provider=OLLAMA, model=None)
    assert settings.choice_for("digest") == AgentChoice()
    assert settings.report_time == "18:00"
    assert settings.budget_exhausted is True  # no budget block: treated as spent

    assert AgentSettings.from_payload({"report_time": "07:30", "budget": {"exhausted": False}}).report_time_of_day() == time(7, 30)


def test_daily_digest_follows_the_report_time_from_settings():
    schedule = DigestSchedule()
    early = datetime(2026, 11, 25, 7, 30, tzinfo=timezone(timedelta(hours=7)))
    assert [r.kind for r in schedule.due_reports(early, daily_at=time(7, 30))] == ["daily"]
    assert schedule.due_reports(early, daily_at=time(18, 0)) == []


def test_heartbeat_lists_only_the_providers_whose_keys_this_container_holds(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    cfg = Config.from_env()
    providers = agent_main._build_providers(cfg, SimpleNamespace(get_token=lambda: "t"))
    assert list(providers) == [OLLAMA, "anthropic"]
    assert "sk-ant-test" not in repr(cfg)


# Helpers --------------------------------------------------------------------

NOW = datetime(2026, 11, 25, 8, 0, tzinfo=timezone.utc)


class _Gateway:
    """Minimal CoreGatewayClient stand-in for one A1 run."""

    def __init__(self, entries):
        self.entries = entries
        self.runs_finished: list[dict] = []
        self.proposals: list[dict] = []

    def graphql(self, query, variables=None):
        del query, variables
        return {"journal_entries": self.entries}

    def start_run(self, **kwargs):
        del kwargs
        return "run-1"

    def finish_run(self, run_id, status, **usage):
        self.runs_finished.append({"id": run_id, "status": status, **usage})

    def submit_proposal(self, proposal):
        self.proposals.append(proposal)
        return {"id": "p1", "deduped": False}


def _pending_entry(entry_id: str, product_name: str) -> dict:
    """A spraying-free fertilizing entry whose product name is missing, so the hard rule flags it and the LLM is asked."""
    return {
        "id": entry_id,
        "parcel_id": "pc_t",
        "entry_date": "2026-11-24T01:30:00",
        "activity_type": "FERTILIZING",
        "status": "PENDING_APPROVAL",
        "notes": "Gọi 0912345678 nếu cần",
        "updated_at": "2026-11-24T02:00:00",
        "weather_precipitation": 0.0,
        "parcel": {"id": "pc_t", "parcel_code": "TC-T", "crop_cycles": []},
        "activities": [
            {
                "id": f"{entry_id}_a",
                "activity_detail": "Bón phân",
                "product_name": product_name,
                "dosage": "2 kg",
                "withdrawal_days": None,
                "safe_harvest_date": None,
            }
        ],
    }


def _ollama_stand_in() -> ReplayProvider:
    """Replay answer named as Ollama: a reason that names the parcel, so a successful fallback is visible."""

    class OllamaStandIn(ReplayProvider):
        name = "ollama"

    return OllamaStandIn(
        fixtures={"default": {"reject_reasons": {"e1": "Thửa TC-T: thiếu tên thuốc, đề nghị bổ sung."}}},
        model="qwen2.5:0.5b",
    )
