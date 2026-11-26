# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A12 (app-builder): turns a manager's request into the cheapest path, and announces finished builds (contract C5).

Rules come first: a store app that fits the request is proposed without asking a model. Otherwise the model asks up to five
questions, routes to a store app or a Sổ tự tạo template, or writes the short app spec. The web validates and creates every
proposal; this agent only checks the shape, so a bad model answer is dropped and never reaches the manager.
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import json
import logging
import re
from typing import Any, Mapping, Sequence

from ..client import CoreGatewayClient, GatewayHTTPError
from ..providers.base import LLMMessage, LLMProvider, compute_input_hash
from ..providers.pricing import estimate_cost_usd
from .common import RULES_MODEL, RULES_PROVIDER

log = logging.getLogger("dxos_agent")

AGENT_NAME = "app-builder"
PROMPT_VERSION = "m13-a12-v1"
MAX_QUESTIONS = 5
QUESTION_MAX = 160
REASON_MAX = 300
MIN_SHARED_WORDS = 2
FINISHED_STATUSES = ("passed", "failed")
ROLES = ("farmer", "officer", "manager")
FIELD_TYPES = ("text", "integer", "number", "date", "boolean", "choice")
APP_ID_RE = re.compile(r"^gen-[a-z0-9-]{3,30}$")
SCREEN_PATH_RE = re.compile(r"^/[a-z0-9/-]{0,40}$")
TABLE_RE = re.compile(r"^[a-z][a-z_]{1,29}$")
READ_NAME_RE = re.compile(r"^[a-z_]{2,30}$")
# Words that say "an app" or glue a sentence together, so two requests are not "alike" for sharing them.
STOPWORDS = frozenset(
    "cần app ứng dụng làm xây phần mềm một các của và cho có là để những được trong với theo dõi tôi chúng hệ thống công cụ".split()
)
NEEDS_KEY_REASON_VI = (
    "Viết app mới cần khoá Claude hoặc Codex mà HTX chưa bật. Trước mắt có thể dùng Sổ tự tạo mẫu trống để ghi dữ liệu."
)
PROMPT_HEAD = (
    "Bạn là trợ lý của hợp tác xã chè, nhận yêu cầu một phần mềm từ quản lý. Chọn cách rẻ nhất làm được việc: "
    "(1) bật một app có sẵn trong kho; (2) dùng một mẫu Sổ tự tạo; "
)
PROMPT_SHAPES = (
    "Chỉ trả lời bằng một đối tượng JSON, đúng một trong các dạng sau:\n"
    '- {"path": "store", "target": "<id app chưa bật>", "reason_vi": "<lý do ngắn>"}\n'
    '- {"path": "book", "target": "<mẫu sổ trong book_templates>", "reason_vi": "<lý do ngắn>"}\n'
)
PROMPT_TAIL = (
    '- {"questions": ["..."]}: chỉ khi answer_text còn trống và thật sự cần hỏi; tối đa 5 câu, mỗi câu ngắn, '
    "hỏi ai dùng, ghi dữ liệu gì, cần xem báo cáo gì.\n"
    "Viết tiếng Việt có dấu. Không bịa id app hay mẫu sổ ngoài danh sách đã cho."
)
CODE_STEP = "(3) chỉ khi hai cách trên không làm được thì viết một app mới. "
NO_CODE_STEP = (
    "Hợp tác xã chưa bật khoá Claude hoặc Codex nên không viết được app mới: chỉ chọn (1) hoặc (2). "
)
CODE_SHAPE = (
    '- {"spec": {"app_id": "gen-<tên-ngắn>", "name_vi", "summary_vi", "roles": [{"role": "farmer|officer|manager", "can_vi"}], '
    '"screens": [{"path": "/...", "title_vi", "purpose_vi"}], "data": [{"table", "fields": [{"name", '
    '"type": "text|integer|number|date|boolean|choice", "label_vi", "choices": ["..."] (chỉ khi type là choice, 2 đến 20 giá trị)}]}], '
    '"agent_reads": [{"name", "description_vi"}]}}: đặc tả ngắn của app mới, chỉ số liệu chỉ đọc, không có hành động ghi.\n'
)
# One loose schema for every answer shape; `_check` enforces the rest, which the shared validator cannot express.
ANSWER_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "path": {"type": "string", "enum": ["store", "book"]},
        "target": {"type": "string", "minLength": 1, "maxLength": 80},
        "reason_vi": {"type": "string", "minLength": 1, "maxLength": 1000},
        "questions": {"type": "array", "items": {"type": "string"}},
        "spec": {"type": "object"},
    },
}


BACKOFF_FIRST = timedelta(minutes=15)
BACKOFF_MAX = timedelta(hours=6)


@dataclass
class RequestBackoff:
    """Per-request wait after a failed attempt: 15 minutes, doubling per further failure, at most 6 hours; a success clears it."""

    failures: dict[str, int] = field(default_factory=dict)
    until: dict[str, datetime] = field(default_factory=dict)

    def blocked(self, request_id: str, now: datetime) -> bool:
        return request_id in self.until and now < self.until[request_id]

    def fail(self, request_id: str, now: datetime) -> None:
        count = self.failures.get(request_id, 0) + 1
        self.failures[request_id] = count
        self.until[request_id] = now + min(BACKOFF_FIRST * 2 ** (count - 1), BACKOFF_MAX)

    def clear(self, request_id: str) -> None:
        self.failures.pop(request_id, None)
        self.until.pop(request_id, None)

    def keep_only(self, request_ids: set[str]) -> None:
        """Forget requests the web no longer lists."""
        for request_id in [r for r in self.until if r not in request_ids]:
            self.clear(request_id)


def _text(value: Any, low: int, high: int, what: str) -> str:
    if not isinstance(value, str) or not low <= len(value.strip()) <= high:
        raise ValueError(f"{what}: expected text of {low}..{high} characters")
    return value.strip()


def _items(value: Any, low: int, high: int, what: str) -> list[Any]:
    if not isinstance(value, list) or not low <= len(value) <= high:
        raise ValueError(f"{what}: expected {low}..{high} items")
    return value


def _matching(value: Any, pattern: re.Pattern[str], what: str) -> str:
    if not isinstance(value, str) or not pattern.match(value):
        raise ValueError(f"{what}: does not match {pattern.pattern}")
    return value


def _field(item: Any) -> dict[str, Any]:
    if not isinstance(item, Mapping) or item.get("type") not in FIELD_TYPES:
        raise ValueError("field: unknown type")
    field = {
        "name": _matching(item.get("name"), TABLE_RE, "field name"),
        "type": item["type"],
        "label_vi": _text(item.get("label_vi"), 1, 60, "field label"),
    }
    if item["type"] == "choice":
        choices = _items(item.get("choices"), 2, 20, "choices")
        field["choices"] = [_text(choice, 1, 40, "choice") for choice in choices]
    return field


def validate_spec(spec: Any) -> dict[str, Any]:
    """The C2 spec as the web's schema reads it; raises ValueError. Unknown keys are dropped, so it never carries actions (H2)."""
    if not isinstance(spec, Mapping):
        raise ValueError("spec: expected an object")
    roles = [
        {"role": item["role"], "can_vi": _text(item.get("can_vi"), 1, 160, "role text")}
        for item in _items(spec.get("roles"), 1, 3, "roles")
        if isinstance(item, Mapping) and item.get("role") in ROLES
    ]
    if len(roles) != len(spec["roles"]):
        raise ValueError("roles: unknown role")
    screens = [
        {
            "path": _matching(item.get("path") if isinstance(item, Mapping) else None, SCREEN_PATH_RE, "screen path"),
            "title_vi": _text(item.get("title_vi"), 1, 60, "screen title"),
            "purpose_vi": _text(item.get("purpose_vi"), 1, 160, "screen purpose"),
        }
        for item in _items(spec.get("screens"), 1, 8, "screens")
    ]
    data = [
        {
            "table": _matching(item.get("table") if isinstance(item, Mapping) else None, TABLE_RE, "table"),
            "fields": [_field(f) for f in _items(item.get("fields"), 1, 15, "fields")],
        }
        for item in _items(spec.get("data", []), 0, 5, "data")
    ]
    reads = [
        {
            "name": _matching(item.get("name") if isinstance(item, Mapping) else None, READ_NAME_RE, "read name"),
            "description_vi": _text(item.get("description_vi"), 1, 160, "read description"),
        }
        for item in _items(spec.get("agent_reads", []), 0, 5, "agent_reads")
    ]
    return {
        "app_id": _matching(spec.get("app_id"), APP_ID_RE, "app_id"),
        "name_vi": _text(spec.get("name_vi"), 1, 60, "name_vi"),
        "summary_vi": _text(spec.get("summary_vi"), 1, 300, "summary_vi"),
        "roles": roles,
        "screens": screens,
        "data": data,
        "agent_reads": reads,
    }


def _words(text: str) -> set[str]:
    return {word for word in re.findall(r"\w+", text.lower()) if len(word) > 1 and word not in STOPWORDS}


def match_store_app(request_text: str, store_apps: Sequence[Mapping[str, Any]]) -> Mapping[str, Any] | None:
    """The not-yet-enabled store app sharing the most words (at least two) with the request, else None."""
    wanted = _words(request_text)
    best, best_count = None, MIN_SHARED_WORDS - 1
    for app in store_apps:
        if app.get("enabled") or not isinstance(app.get("id"), str):
            continue
        count = len(wanted & _words(f"{app.get('name_vi', '')} {app.get('description_vi', '')}"))
        if count > best_count:
            best, best_count = app, count
    return best


def _messages(req: Mapping[str, Any], can_code: bool) -> list[LLMMessage]:
    system = PROMPT_HEAD + (CODE_STEP if can_code else NO_CODE_STEP) + PROMPT_SHAPES + (CODE_SHAPE if can_code else "") + PROMPT_TAIL
    payload = {
        "request_text": req.get("request_text"),
        "questions_asked": req.get("questions") or [],
        "answer_text": req.get("answer_text"),
        "store_apps": [
            {key: app.get(key) for key in ("id", "name_vi", "description_vi", "enabled")} for app in req.get("store_apps") or []
        ],
        "book_templates": req.get("book_templates") or [],
    }
    return [
        LLMMessage(role="system", content=system),
        LLMMessage(role="user", content=json.dumps(payload, ensure_ascii=False, sort_keys=True)),
    ]


def _check(req: Mapping[str, Any], data: Mapping[str, Any], can_code: bool) -> tuple[str, Any]:
    """One model answer as (`route`, body) | (`spec`, spec) | (`questions`, list) | (`needs_code`, None); ValueError otherwise."""
    if "path" in data:
        target = data.get("target")
        reason = _text(data.get("reason_vi"), 1, 1000, "reason_vi")[:REASON_MAX]
        if data["path"] == "store":
            offered = {app.get("id") for app in req.get("store_apps") or [] if not app.get("enabled")}
        else:
            offered = set(req.get("book_templates") or [])
        if target not in offered:
            raise ValueError(f"target {target!r} was not offered for path {data['path']}")
        return "route", {"path": data["path"], "target": target, "reason_vi": reason}
    if "spec" in data:
        return ("spec", validate_spec(data["spec"])) if can_code else ("needs_code", None)
    if "questions" in data:
        if req.get("answer_text") or req.get("questions"):
            raise ValueError("questions asked again")
        questions = [q.strip()[:QUESTION_MAX] for q in data["questions"] if isinstance(q, str) and q.strip()]
        if not questions:
            raise ValueError("no questions")
        return "questions", questions[:MAX_QUESTIONS]
    raise ValueError("answer has no path, spec or questions")


def _external_requests(providers: Sequence[LLMProvider]) -> int:
    return sum(getattr(provider, "requests_sent", 0) for provider in providers if provider.external)


def _decide(
    gateway: CoreGatewayClient,
    req: Mapping[str, Any],
    providers: Sequence[LLMProvider],
    can_code: bool,
) -> tuple[str, Any] | None:
    """Ask the provider chain once per provider; the first answer that passes `_check` wins. One run row covers the calls."""
    if not providers:
        return None
    messages = _messages(req, can_code)
    primary = providers[0]
    run_id = gateway.start_run(
        agent=AGENT_NAME,
        trigger="schedule",
        provider=primary.name,
        model=primary.model,
        prompt_version=PROMPT_VERSION,
        input_hash=compute_input_hash(messages, ANSWER_SCHEMA),
    )
    external_before = _external_requests(providers)
    used = {"provider": RULES_PROVIDER, "model": RULES_MODEL}
    tokens_in = tokens_out = 0
    cost = 0.0
    decision: tuple[str, Any] | None = None
    error = "no provider gave a usable answer"
    for provider in providers:
        try:
            result = provider.complete_json(messages, ANSWER_SCHEMA)
            tokens_in += result.tokens_in
            tokens_out += result.tokens_out
            if provider.external:
                cost += estimate_cost_usd(result.model, result.tokens_in, result.tokens_out)
            decision = _check(req, result.data, can_code)
        except Exception as exc:  # a provider failure or an unusable answer: the next provider, then nothing is posted
            log.warning("A12 provider %s gave no usable answer: %s", provider.name, exc)
            error = str(exc)[:1000]
            continue
        used = {"provider": provider.name, "model": result.model}
        break
    gateway.finish_run(
        run_id,
        status="ok" if decision is not None else "failed",
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost_estimate_usd=cost,
        external_calls=_external_requests(providers) - external_before,
        error=None if decision is not None else error,
        **used,
    )
    return decision


def _with_suffix(app_id: str) -> str:
    """`gen-<name>` with `-2` appended, the name cut so the id keeps its 30 character limit."""
    name = app_id[len("gen-"):]
    return f"gen-{name[:28]}-2" if len(name) > 28 else f"gen-{name}-2"


def _post_spec(gateway: CoreGatewayClient, request_id: str, spec: dict[str, Any]) -> None:
    """Post the spec; when its id is taken, once more with a `-2` suffix (Review Focus 5)."""
    for attempt in range(2):
        try:
            gateway.post_app_spec(request_id, spec)
            return
        except GatewayHTTPError as exc:
            if exc.status_code != 409 or "APP_ID_TAKEN" not in str(exc) or attempt == 1:
                raise
            spec = {**spec, "app_id": _with_suffix(spec["app_id"])}


def _handle(gateway: CoreGatewayClient, req: Mapping[str, Any], providers: Sequence[LLMProvider]) -> bool:
    """False when the attempt failed (a model or web failure), so the caller backs off; True otherwise."""
    request_id = str(req["id"])
    if req.get("status") in FINISHED_STATUSES:
        gateway.announce_app_build(request_id)  # the web queues the message and the install proposal once
        return True
    if req.get("questions") and not req.get("answer_text"):
        return True  # still waiting for the manager's answer
    can_code = bool(req.get("code_providers"))
    match = match_store_app(str(req.get("request_text") or ""), req.get("store_apps") or [])
    if match is not None:
        reason = f'App "{match.get("name_vi")}" trong kho ứng dụng đã làm được việc này, bật lên là dùng.'
        gateway.post_app_route(request_id, {"path": "store", "target": match["id"], "reason_vi": reason})
        return True
    if not providers:
        return True
    decision = _decide(gateway, req, providers, can_code)
    if decision is None:
        return False
    kind, value = decision
    if kind == "route":
        gateway.post_app_route(request_id, value)
    elif kind == "questions":
        gateway.post_app_questions(request_id, value)
    elif kind == "spec":
        _post_spec(gateway, request_id, value)
    else:  # needs_code: the model wanted new code, but no Claude or Codex key is on
        templates = req.get("book_templates") or []
        target = "blank" if "blank" in templates else (templates[0] if templates else None)
        if target is None:
            log.warning("A12 request %s needs code and no book template exists", request_id)
            return False
        gateway.post_app_route(request_id, {"path": "book", "target": target, "reason_vi": NEEDS_KEY_REASON_VI})
    return True


def run_app_builder(
    gateway: CoreGatewayClient,
    now: datetime,
    providers: Sequence[LLMProvider],
    backoff: RequestBackoff | None = None,
) -> None:
    """Handle every request the web lists; a failing request is logged and waits out its backoff, the others go on."""
    backoff = backoff if backoff is not None else RequestBackoff()
    requests = gateway.get_app_builder_requests()
    backoff.keep_only({str(req.get("id")) for req in requests})
    for req in requests:
        request_id = str(req.get("id"))
        if backoff.blocked(request_id, now):
            continue
        try:
            ok = _handle(gateway, req, providers)
        except Exception:
            log.exception("A12 request %s failed", request_id)
            ok = False
        if ok:
            backoff.clear(request_id)
        else:
            backoff.fail(request_id, now)
