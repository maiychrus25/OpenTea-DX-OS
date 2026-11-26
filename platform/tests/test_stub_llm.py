# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The test-only LLM stub answers both API shapes and records what it was sent."""
import importlib.util
import json
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

STUB_PATH = Path(__file__).resolve().parent / "stub_llm.py"


@pytest.fixture
def stub():
    spec = importlib.util.spec_from_file_location("stub_llm", STUB_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    server = module.make_server(0, "127.0.0.1")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    post(base + "/control/reset", {})
    yield base
    server.shutdown()
    server.server_close()
    thread.join()


def post(url, body, headers=None):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get(url):
    with urllib.request.urlopen(url, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


def review_message():
    payload = {"rejected": [{"entry_id": "je_1", "parcel_code": "TC-A1", "rule_hint": "Thiếu chi tiết"}]}
    return json.dumps(payload, ensure_ascii=False)


def test_anthropic_shape_returns_reasons_in_the_first_text_block(stub):
    answer = post(
        stub + "/v1/messages",
        {"model": "claude-haiku-5-5", "max_tokens": 512, "system": "rà soát",
         "messages": [{"role": "user", "content": review_message()}]},
        {"x-api-key": "fake-key", "anthropic-version": "2026-10-21"},
    )
    assert [b["type"] for b in answer["content"]] == ["thinking", "text"]
    reasons = json.loads(answer["content"][1]["text"])["reject_reasons"]
    assert "TC-A1" in reasons["je_1"] and len(reasons["je_1"]) >= 5
    assert answer["usage"] == {"input_tokens": 123, "output_tokens": 45}


def test_openai_shape_returns_reasons_in_the_choice_message(stub):
    answer = post(
        stub + "/v1/chat/completions",
        {"model": "gpt-stub", "messages": [{"role": "system", "content": "rà soát"}, {"role": "user", "content": review_message()}],
         "response_format": {"type": "json_object"}},
        {"Authorization": "Bearer fake-key"},
    )
    reasons = json.loads(answer["choices"][0]["message"]["content"])["reject_reasons"]
    assert "TC-A1" in reasons["je_1"]
    assert answer["usage"] == {"prompt_tokens": 123, "completion_tokens": 45}


def test_no_rejected_entries_gives_empty_reasons(stub):
    answer = post(stub + "/v1/messages", {"model": "m", "messages": [{"role": "user", "content": "{}"}]})
    assert json.loads(answer["content"][1]["text"]) == {"reject_reasons": {}}


def test_requests_are_recorded_with_their_headers_and_cleared_by_reset(stub):
    post(stub + "/v1/messages", {"model": "m", "messages": []}, {"x-api-key": "fake-key", "anthropic-version": "2026-10-21"})
    post(stub + "/v1/chat/completions", {"model": "m", "messages": []}, {"Authorization": "Bearer fake-key"})
    calls = get(stub + "/control/calls")["calls"]
    assert [call["path"] for call in calls] == ["/v1/messages", "/v1/chat/completions"]
    assert calls[0]["x-api-key"] == "fake-key" and calls[0]["anthropic-version"] == "2026-10-21"
    assert calls[1]["authorization"] == "Bearer fake-key"
    assert calls[0]["body"] == {"model": "m", "messages": []}
    post(stub + "/control/reset", {})
    assert get(stub + "/control/calls")["calls"] == []


def test_unknown_path_and_bad_json_are_refused(stub):
    with pytest.raises(urllib.error.HTTPError) as missing:
        post(stub + "/v1/unknown", {})
    assert missing.value.code == 404
    missing.value.close()
    req = urllib.request.Request(stub + "/v1/messages", data=b"not json", method="POST")
    with pytest.raises(urllib.error.HTTPError) as bad:
        urllib.request.urlopen(req, timeout=5)
    assert bad.value.code == 400
    bad.value.close()


def test_health_endpoint_answers(stub):
    assert get(stub + "/healthz") == {"ok": True}


def test_bulletin_request_gets_a_bulletin_text_key(stub):
    # A5 asks for {"bulletin_vi": ...} in the system message; the answer carries that key with a text of 50+ characters.
    answer = post(
        stub + "/v1/messages",
        {"model": "claude-haiku-5-5", "max_tokens": 512,
         "system": "Viết bản tin thị trường. Trả về JSON {\"bulletin_vi\": \"...\"}.",
         "messages": [{"role": "user", "content": json.dumps({"rows": []}, ensure_ascii=False)}]},
        {"x-api-key": "fake-key", "anthropic-version": "2026-10-21"},
    )
    text = json.loads(answer["content"][1]["text"])["bulletin_vi"]
    assert len(text) >= 50 and not any(ch.isdigit() for ch in text)


ASSISTANT_SYSTEM = 'Chọn đúng một công cụ hoặc hành động. Trả về JSON {"type": "tool|action|unknown", "name": "...", "args": {}}.'


def intent_request(stub, content, path="/v1/messages"):
    body = {"model": "m", "system": ASSISTANT_SYSTEM, "messages": [{"role": "user", "content": content}]}
    if path == "/v1/chat/completions":
        body = {"model": "m", "messages": [{"role": "system", "content": ASSISTANT_SYSTEM}, {"role": "user", "content": content}]}
    return post(stub + path, body, {"x-api-key": "fake-key"})


def test_intent_request_with_mai_gets_the_weather_tool(stub):
    answer = intent_request(stub, json.dumps({"text": "mai có nên đi hái không"}, ensure_ascii=False))
    assert json.loads(answer["content"][1]["text"]) == {"type": "tool", "name": "weather", "args": {}}


def test_intent_request_without_mai_is_unknown(stub):
    answer = intent_request(stub, json.dumps({"text": "duyệt hết nhật ký"}, ensure_ascii=False))
    assert json.loads(answer["content"][1]["text"]) == {"type": "unknown"}


def test_intent_request_reads_a_plain_sentence_and_the_openai_shape(stub):
    answer = intent_request(stub, "Mai đi đâu?", path="/v1/chat/completions")
    assert json.loads(answer["choices"][0]["message"]["content"]) == {"type": "tool", "name": "weather", "args": {}}


def test_intent_request_ignores_the_keys_of_the_json_object_itself(stub):
    # The intent prompt lists the tools as JSON keys; only the user's text decides the answer.
    answer = intent_request(stub, json.dumps({"tools": [{"name": "mai"}], "text": "gibberish"}, ensure_ascii=False))
    assert json.loads(answer["content"][1]["text"]) == {"type": "unknown"}


def test_intent_request_reads_the_sentence_field_of_the_a7_payload(stub):
    # The shape A7 sends: the sentence sits in payload["sentence"]["text"]; the tool names are not the sentence.
    content = json.dumps({"actions": [{"name": "journal.create"}], "sentence": {"text": "mai có nên đi hái không", "trust": "untrusted"},
                          "today": "2026-11-26", "tools": [{"name": "mai"}]}, ensure_ascii=False, sort_keys=True)
    answer = intent_request(stub, content)
    assert json.loads(answer["content"][1]["text"]) == {"type": "tool", "name": "weather", "args": {}}


def test_intent_request_with_a7_payload_and_no_mai_is_unknown(stub):
    content = json.dumps({"actions": [], "sentence": {"text": "duyệt hết nhật ký", "trust": "untrusted"},
                          "today": "2026-11-26", "tools": [{"name": "mai"}]}, ensure_ascii=False, sort_keys=True)
    answer = intent_request(stub, content)
    assert json.loads(answer["content"][1]["text"]) == {"type": "unknown"}
