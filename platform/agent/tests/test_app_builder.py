# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""A12 (app-builder): rules pick the cheap paths first, the LLM asks, routes or writes the spec; finished builds are announced."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from typing import Any

import pytest

from dxos_agent import __main__ as agent_main
from dxos_agent.agents import app_builder
from dxos_agent.agents.app_builder import RequestBackoff, run_app_builder, validate_spec
from dxos_agent.client import GatewayHTTPError
from dxos_agent.providers import ProviderError, ReplayProvider
from test_client import _gateway_with

NOW = datetime(2026, 11, 27, 3, 0, tzinfo=timezone.utc)
STORE = [
    {"id": "tea-shop", "name_vi": "Cửa hàng chè", "description_vi": "Bán chè trực tuyến cho nông hộ", "enabled": True},
    {"id": "stock-ledger", "name_vi": "Sổ kho vật tư", "description_vi": "Theo dõi kho vật tư nông nghiệp", "enabled": False},
]
TEMPLATES = ["picking", "spraying", "fertilising", "cashbook", "blank"]
SPEC = {
    "app_id": "gen-fertiliser-stock",
    "name_vi": "Kho phân bón",
    "summary_vi": "Ghi nhập, xuất và tồn kho phân bón của hợp tác xã.",
    "roles": [{"role": "manager", "can_vi": "Xem và ghi nhập xuất kho"}],
    "screens": [{"path": "/", "title_vi": "Tồn kho", "purpose_vi": "Xem số lượng từng loại phân"}],
    "data": [
        {
            "table": "stock_items",
            "fields": [
                {"name": "name", "type": "text", "label_vi": "Tên phân"},
                {"name": "unit", "type": "choice", "label_vi": "Đơn vị", "choices": ["kg", "bao"]},
            ],
        }
    ],
    "agent_reads": [{"name": "low_stock", "description_vi": "Số loại phân sắp hết"}],
}


def request(**over: Any) -> dict[str, Any]:
    base = {
        "id": "req-1",
        "status": "new",
        "request_text": "cần app theo dõi kho phân bón",
        "questions": [],
        "answer_text": None,
        "store_apps": STORE,
        "book_templates": TEMPLATES,
        "custom_books_enabled": True,
        "code_providers": ["claude-code"],
    }
    return {**base, **over}


class Gateway:
    """Serves the request list and records what A12 posts; `errors` maps a route name to a queue of exceptions."""

    def __init__(self, requests: list[dict[str, Any]], errors: dict[str, list[Exception | None]] | None = None) -> None:
        self.requests = requests
        self.errors = {key: list(value) for key, value in (errors or {}).items()}
        self.calls: list[tuple[str, str, Any]] = []
        self.runs: list[dict[str, Any]] = []
        self.finished: list[dict[str, Any]] = []

    def _maybe_fail(self, name: str) -> None:
        queue = self.errors.get(name)
        if queue:
            error = queue.pop(0)
            if error is not None:
                raise error

    def get_app_builder_requests(self):
        return self.requests

    def post_app_questions(self, request_id, questions):
        self.calls.append(("questions", request_id, questions))
        self._maybe_fail("questions")

    def post_app_route(self, request_id, body):
        self.calls.append(("route", request_id, body))
        self._maybe_fail("route")

    def post_app_spec(self, request_id, spec):
        self.calls.append(("spec", request_id, spec))
        self._maybe_fail("spec")

    def announce_app_build(self, request_id):
        self.calls.append(("announce", request_id, None))
        self._maybe_fail("announce")
        return {"proposal_id": "p-1"}

    def start_run(self, **kwargs):
        self.runs.append(kwargs)
        return f"run-{len(self.runs)}"

    def finish_run(self, run_id, status, **kwargs):
        self.finished.append({"id": run_id, "status": status, **kwargs})


def llm(*answers: Any) -> list[ReplayProvider]:
    """A provider that answers each call in turn (the last answer repeats)."""
    return [ReplayProvider(fixtures={"default": list(answers)})]


def taken() -> GatewayHTTPError:
    return GatewayHTTPError('Gateway POST failed (409): {"error":{"code":"APP_ID_TAKEN"}}', 409)


# --- rules ---------------------------------------------------------------------------------------------------------


def test_a_store_app_sharing_two_words_is_routed_without_the_llm():
    gateway = Gateway([request(request_text="cần app theo dõi kho vật tư")])
    provider = ReplayProvider(resolver=lambda *a: pytest.fail("the LLM must not be asked"))

    run_app_builder(gateway, NOW, [provider])

    assert [call[:2] for call in gateway.calls] == [("route", "req-1")]
    body = gateway.calls[0][2]
    assert (body["path"], body["target"]) == ("store", "stock-ledger") and body["reason_vi"].strip()
    assert gateway.runs == []  # no model call, so no run row


def test_an_enabled_store_app_is_not_offered_again():
    gateway = Gateway([request(request_text="bán chè trực tuyến")])

    run_app_builder(gateway, NOW, llm({"path": "book", "target": "blank", "reason_vi": "Dùng sổ tự tạo."}))

    assert [call[0] for call in gateway.calls] == ["route"]
    assert gateway.calls[0][2]["path"] == "book"


def test_one_shared_word_is_not_a_match():
    gateway = Gateway([request(request_text="cần kho lạnh")])

    run_app_builder(gateway, NOW, llm({"questions": ["Kho lạnh dùng để làm gì?"]}))

    assert [call[0] for call in gateway.calls] == ["questions"]


# --- the LLM ---------------------------------------------------------------------------------------------------------


def test_first_pass_may_ask_up_to_five_questions_each_trimmed_to_160_characters():
    gateway = Gateway([request()])
    questions = [f"Câu hỏi {i}?" for i in range(5)]
    questions[0] = "x" * 200

    run_app_builder(gateway, NOW, llm({"questions": questions}))

    sent = gateway.calls[0][2]
    assert gateway.calls[0][:2] == ("questions", "req-1")
    assert len(sent) == 5 and all(len(q) <= 160 for q in sent)
    assert gateway.runs and gateway.finished[0]["status"] == "ok"


def test_more_than_five_questions_are_cut_to_five():
    gateway = Gateway([request()])

    run_app_builder(gateway, NOW, llm({"questions": [f"Hỏi {i}?" for i in range(8)]}))

    assert len(gateway.calls[0][2]) == 5


def test_a_request_with_an_answer_is_never_asked_again():
    gateway = Gateway([request(status="asking", questions=["Ai dùng?"], answer_text="Thủ kho dùng")])

    run_app_builder(gateway, NOW, [*llm({"questions": ["Còn gì nữa?"]}), *llm({"spec": SPEC})])

    assert [call[0] for call in gateway.calls] == ["spec"]  # the second question set was dropped, the next provider answered


def test_a_request_still_waiting_for_its_answer_is_skipped():
    gateway = Gateway([request(status="asking", questions=["Ai dùng?"])])

    run_app_builder(gateway, NOW, [ReplayProvider(resolver=lambda *a: pytest.fail("no LLM call while waiting"))])

    assert gateway.calls == []


def test_the_llm_routes_to_a_book_template():
    gateway = Gateway([request()])

    run_app_builder(gateway, NOW, llm({"path": "book", "target": "fertilising", "reason_vi": "Sổ bón phân đủ dùng."}))

    assert gateway.calls == [("route", "req-1", {"path": "book", "target": "fertilising", "reason_vi": "Sổ bón phân đủ dùng."})]


def test_a_target_the_web_did_not_offer_is_refused_and_nothing_is_posted():
    gateway = Gateway([request()])

    run_app_builder(gateway, NOW, llm({"path": "book", "target": "no-such-template", "reason_vi": "x"}))

    assert gateway.calls == []
    assert gateway.finished[0]["status"] == "failed"


def test_the_llm_may_not_route_to_an_enabled_store_app():
    gateway = Gateway([request()])

    run_app_builder(gateway, NOW, llm({"path": "store", "target": "tea-shop", "reason_vi": "x"}))

    assert gateway.calls == []


def test_a_spec_is_validated_and_posted_clean():
    gateway = Gateway([request()])
    messy = {**SPEC, "actions": [{"name": "danger"}], "screens": [{**SPEC["screens"][0], "extra": 1}]}

    run_app_builder(gateway, NOW, llm({"spec": messy}))

    assert gateway.calls == [("spec", "req-1", SPEC)]  # unknown keys dropped, so a spec never carries actions (H2)


@pytest.mark.parametrize(
    "change",
    [
        {"app_id": "fertiliser"},
        {"app_id": "gen-ab"},
        {"app_id": "gen-" + "a" * 31},
        {"name_vi": ""},
        {"summary_vi": "x" * 301},
        {"roles": []},
        {"roles": [{"role": "admin", "can_vi": "x"}]},
        {"screens": []},
        {"screens": [{"path": "bad", "title_vi": "a", "purpose_vi": "b"}]},
        {"screens": [{"path": "/", "title_vi": "a", "purpose_vi": "b"}] * 9},
        {"data": [{"table": "T", "fields": [{"name": "a", "type": "text", "label_vi": "a"}]}]},
        {"data": [{"table": "items", "fields": []}]},
        {"data": [{"table": "items", "fields": [{"name": "a", "type": "money", "label_vi": "a"}]}]},
        {"data": [{"table": "items", "fields": [{"name": "a", "type": "choice", "label_vi": "a"}]}]},
        {"data": [{"table": "items", "fields": [{"name": "a", "type": "choice", "label_vi": "a", "choices": ["x"]}]}]},
        {"agent_reads": [{"name": "A", "description_vi": "x"}]},
        {"agent_reads": [{"name": "ab", "description_vi": "x"}] * 6},
    ],
)
def test_validate_spec_refuses_what_the_web_schema_refuses(change):
    with pytest.raises(ValueError):
        validate_spec({**SPEC, **change})


def test_validate_spec_accepts_the_example_and_keeps_it_unchanged():
    assert validate_spec(SPEC) == SPEC


def test_an_invalid_spec_is_not_posted():
    gateway = Gateway([request()])

    run_app_builder(gateway, NOW, llm({"spec": {**SPEC, "app_id": "bad"}}))

    assert gateway.calls == []


def test_the_next_provider_answers_when_the_first_fails():
    class Down(ReplayProvider):
        def _generate(self, messages, schema):
            raise ProviderError("down")

    gateway = Gateway([request()])
    chain = [Down(fixtures={}), *llm({"spec": SPEC})]

    run_app_builder(gateway, NOW, chain)

    assert [call[0] for call in gateway.calls] == ["spec"]


def test_every_provider_failing_posts_nothing_and_raises_nothing():
    class Down(ReplayProvider):
        def _generate(self, messages, schema):
            raise ProviderError("down")

    gateway = Gateway([request()])

    run_app_builder(gateway, NOW, [Down(fixtures={})])

    assert gateway.calls == []
    assert gateway.finished[0]["status"] == "failed"


def test_the_prompt_lists_the_store_the_templates_and_the_answer():
    seen: list[str] = []

    def resolver(messages, schema, base_hash):
        seen.append("\n".join(m.content for m in messages))
        return {"spec": SPEC}

    gateway = Gateway([request(status="asking", questions=["Ai dùng?"], answer_text="Thủ kho")])

    run_app_builder(gateway, NOW, [ReplayProvider(resolver=resolver)])

    assert "cần app theo dõi kho phân bón" in seen[0] and "Thủ kho" in seen[0] and "fertilising" in seen[0]


# --- no code provider ------------------------------------------------------------------------------------------------


def test_without_a_code_provider_a_spec_is_never_posted_and_the_manager_is_told():
    gateway = Gateway([request(code_providers=[])])

    run_app_builder(gateway, NOW, llm({"spec": SPEC}))

    assert [call[0] for call in gateway.calls] == ["route"]
    body = gateway.calls[0][2]
    assert body["path"] == "book" and body["target"] == "blank"
    assert "Claude" in body["reason_vi"] and "Codex" in body["reason_vi"]


def test_without_a_code_provider_the_prompt_does_not_offer_a_spec():
    seen: list[str] = []

    def resolver(messages, schema, base_hash):
        seen.append("\n".join(m.content for m in messages))
        return {"path": "book", "target": "blank", "reason_vi": "Dùng sổ."}

    run_app_builder(Gateway([request(code_providers=[])]), NOW, [ReplayProvider(resolver=resolver)])

    assert "spec" not in seen[0] and "Claude" in seen[0]


# --- the app id is taken -----------------------------------------------------------------------------------------------


def test_a_taken_app_id_is_retried_once_with_a_suffix():
    gateway = Gateway([request()], errors={"spec": [taken(), None]})

    run_app_builder(gateway, NOW, llm({"spec": SPEC}))

    spec_calls = [call for call in gateway.calls if call[0] == "spec"]
    assert [call[2]["app_id"] for call in spec_calls] == ["gen-fertiliser-stock", "gen-fertiliser-stock-2"]


def test_the_suffix_keeps_the_id_within_its_limit():
    long_id = "gen-" + "a" * 30
    gateway = Gateway([request()], errors={"spec": [taken(), None]})

    run_app_builder(gateway, NOW, llm({"spec": {**SPEC, "app_id": long_id}}))

    retried = [call for call in gateway.calls if call[0] == "spec"][1][2]["app_id"]
    assert retried.endswith("-2") and len(retried) == len("gen-") + 30


def test_a_second_taken_id_is_not_retried_again():
    gateway = Gateway([request()], errors={"spec": [taken(), taken(), taken()]})

    run_app_builder(gateway, NOW, llm({"spec": SPEC}))

    assert len([call for call in gateway.calls if call[0] == "spec"]) == 2


# --- announce ----------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("status", ["passed", "failed"])
def test_a_finished_build_is_announced_once_without_the_llm(status):
    gateway = Gateway([request(id="req-9", status=status)])

    run_app_builder(gateway, NOW, [ReplayProvider(resolver=lambda *a: pytest.fail("no LLM call"))])

    assert gateway.calls == [("announce", "req-9", None)]


def test_a_failed_announce_does_not_stop_the_other_requests():
    gateway = Gateway(
        [request(id="a", status="passed"), request(id="b", status="failed")],
        errors={"announce": [GatewayHTTPError("boom", 500), None]},
    )

    run_app_builder(gateway, NOW, [])

    assert [call[1] for call in gateway.calls] == ["a", "b"]


def test_one_failing_request_does_not_stop_the_next():
    gateway = Gateway(
        [request(id="a"), request(id="b", request_text="cần app theo dõi kho vật tư")],
        errors={"spec": [GatewayHTTPError("boom", 500)]},
    )

    run_app_builder(gateway, NOW, llm({"spec": SPEC}))

    assert [(call[0], call[1]) for call in gateway.calls] == [("spec", "a"), ("route", "b")]


def test_no_requests_means_no_run_and_no_call():
    gateway = Gateway([])

    run_app_builder(gateway, NOW, llm({"spec": SPEC}))

    assert gateway.calls == [] and gateway.runs == []


# --- the client --------------------------------------------------------------------------------------------------------


def test_client_paths_are_all_under_the_internal_agent_prefix():
    calls: list = []
    gateway = _gateway_with({"data": {"requests": [{"id": "r1"}]}}, calls=calls)

    assert gateway.get_app_builder_requests() == [{"id": "r1"}]
    gateway.post_app_questions("r1", ["Ai dùng?"])
    gateway.post_app_route("r1", {"path": "store", "target": "x", "reason_vi": "y"})
    gateway.post_app_spec("r1", SPEC)
    gateway.announce_app_build("r1")

    base = "http://gateway/api/internal/agent/app-builder/requests"
    assert [(method, url) for method, url, _ in calls] == [
        ("GET", base),
        ("POST", f"{base}/r1/questions"),
        ("POST", f"{base}/r1/route"),
        ("POST", f"{base}/r1/spec"),
        ("POST", f"{base}/r1/announce"),
    ]
    assert calls[1][2] == {"questions": ["Ai dùng?"]}
    assert calls[3][2] == SPEC
    assert calls[4][2] == {}


@pytest.mark.parametrize(
    "reply",
    [{"data": [{"id": "r1"}]}, {"data": {"requests": [{"id": "r1"}]}}, {"requests": [{"id": "r1"}]}],
)
def test_client_reads_the_request_list_in_any_of_the_internal_shapes(reply):
    assert _gateway_with(reply).get_app_builder_requests() == [{"id": "r1"}]


def test_announce_answer_is_the_data_object():
    assert _gateway_with({"data": {"proposal_id": "p-1"}}).announce_app_build("r1") == {"proposal_id": "p-1"}


# --- wiring ------------------------------------------------------------------------------------------------------------


def test_a12_runs_every_cycle_in_the_agent_loop(monkeypatch):
    monkeypatch.setenv("DXOS_LABS", "1")  # frozen feature (ADR 0005): runs only with the labs switch on
    calls: list[str] = []
    local_model = ReplayProvider(fixtures={"default": {"summary_vi": "x"}})
    local_model.name = "ollama"

    class NoGateway:
        pass

    runtime = agent_main._CooperativeRuntime(
        creds=agent_main.AgentCredentials(htx_code="TC01", client_id="c", client_secret="s"),
        gateway=NoGateway(),
        providers={"ollama": local_model},
    )
    for name in ("field_watch.run_field_watch", "harvest_ready.run_harvest_ready", "disease_watch.run_disease_watch",
                 "daily_campaign.run_daily_campaign", "bulletin.run_bulletin", "improvement.run_improvement"):
        module, attr = name.split(".")
        monkeypatch.setattr(getattr(agent_main, module), attr, lambda *a, **k: None)
    monkeypatch.setattr(agent_main.disease_watch, "fetch_window", lambda *a, **k: ([],))
    monkeypatch.setattr(agent_main.app_suggestions, "run_app_suggestions", lambda *a, **k: None)
    monkeypatch.setattr(agent_main.app_builder, "run_app_builder", lambda gateway, now, chain, backoff: calls.append(chain[0].name))

    agent_main._run_m4_agents(runtime, NOW, agent_main.AgentSettings())
    agent_main._run_m4_agents(runtime, NOW, agent_main.AgentSettings())
    if runtime.bulletin_thread is not None:
        runtime.bulletin_thread.join(5)

    assert calls == ["ollama", "ollama"]


def test_the_agent_name_is_the_one_the_web_knows():
    assert app_builder.AGENT_NAME == "app-builder"
    assert Path(app_builder.__file__).name == "app_builder.py"


def test_the_smoke_recording_answers_the_fertiliser_request_with_a_valid_spec():
    replay = Path(__file__).parents[1] / "replay"
    gateway = Gateway([request(store_apps=[], book_templates=["blank"])])

    run_app_builder(gateway, NOW, [ReplayProvider(replay_dir=replay)])

    assert [call[:2] for call in gateway.calls] == [("spec", "req-1")]
    assert gateway.calls[0][2]["app_id"] == "gen-fertiliser-stock"
    assert validate_spec(gateway.calls[0][2]) == gateway.calls[0][2]


# --- backoff -------------------------------------------------------------------------------------------------------------


class Counting(ReplayProvider):
    """Fails every call and counts them."""

    calls = 0

    def _generate(self, messages, schema):
        Counting.calls += 1
        raise ProviderError("down")


def _failing_cycle(gateway, backoff, at, provider):
    run_app_builder(gateway, at, [provider], backoff)


def test_a_failing_request_is_not_retried_next_cycle_but_after_fifteen_minutes():
    Counting.calls = 0
    gateway, backoff, provider = Gateway([request()]), RequestBackoff(), Counting(fixtures={})
    _failing_cycle(gateway, backoff, NOW, provider)
    first = Counting.calls
    _failing_cycle(gateway, backoff, NOW + timedelta(seconds=30), provider)
    assert Counting.calls == first
    _failing_cycle(gateway, backoff, NOW + timedelta(minutes=15), provider)
    assert Counting.calls > first


def test_the_wait_doubles_per_failure_and_is_capped_at_six_hours():
    backoff, waits = RequestBackoff(), []
    for _ in range(8):
        backoff.fail("r", NOW)
        waits.append(backoff.until["r"] - NOW)
    assert waits[:4] == [timedelta(minutes=15), timedelta(minutes=30), timedelta(hours=1), timedelta(hours=2)]
    assert waits[-1] == timedelta(hours=6) and max(waits) == timedelta(hours=6)


def test_a_success_clears_the_backoff():
    gateway, backoff = Gateway([request()]), RequestBackoff()
    backoff.fail("req-1", NOW)
    later = NOW + timedelta(minutes=15)
    run_app_builder(gateway, later, llm({"spec": SPEC}), backoff)
    assert [c[0] for c in gateway.calls] == ["spec"]
    assert "req-1" not in backoff.until and "req-1" not in backoff.failures


def test_a_web_failure_backs_off_and_other_requests_are_not_held_back():
    gateway = Gateway([request(id="a"), request(id="b")], errors={"spec": [GatewayHTTPError("boom", 500), None]})
    backoff = RequestBackoff()
    run_app_builder(gateway, NOW, llm({"spec": SPEC}), backoff)
    assert [(c[0], c[1]) for c in gateway.calls] == [("spec", "a"), ("spec", "b")]
    assert backoff.blocked("a", NOW) and not backoff.blocked("b", NOW)
    gateway.requests = [request(id="a")]  # b was answered and the web no longer lists it
    run_app_builder(gateway, NOW + timedelta(minutes=1), llm({"spec": SPEC}), backoff)
    assert [c[1] for c in gateway.calls] == ["a", "b"]  # a is still waiting


def test_a_failed_announce_waits_fifteen_minutes():
    gateway = Gateway([request(id="a", status="passed")], errors={"announce": [GatewayHTTPError("boom", 500), None]})
    backoff = RequestBackoff()
    run_app_builder(gateway, NOW, [], backoff)
    run_app_builder(gateway, NOW + timedelta(minutes=14), [], backoff)
    assert len(gateway.calls) == 1
    run_app_builder(gateway, NOW + timedelta(minutes=15), [], backoff)
    assert len(gateway.calls) == 2 and "a" not in backoff.until


def test_requests_the_web_no_longer_lists_are_forgotten():
    backoff = RequestBackoff()
    backoff.fail("gone", NOW)
    run_app_builder(Gateway([]), NOW, [], backoff)
    assert backoff.until == {}
