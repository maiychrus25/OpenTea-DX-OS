# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Entrypoint for dxos-agent executing scheduled per-cooperative operational agents."""
import argparse
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone
import faulthandler
import logging
import os
from pathlib import Path
import signal
import sys
import threading
import time as time_module

from . import __version__
from .agents import app_builder, app_suggestions, bulletin, cross_check, daily_campaign, disease_watch, field_watch, harvest_ready, improvement, staff_tasks, strategy
from .agents.assistant import run_assistant_once
from .agents.digest import DigestSchedule, run_digest
from .agents.journal_review import (
    AGENT_NAME as JOURNAL_REVIEW_AGENT,
    fetch_pending_entries,
    pending_evidence_hash,
    run_journal_review,
)
from .client import AgentCredentials, CoreGatewayClient, KeycloakTokenClient, load_all_agent_credentials
from .config import Config
from .providers import (
    AnthropicProvider,
    LLMProvider,
    LLMResponse,
    OllamaProvider,
    OpenAIProvider,
    ProviderError,
    ReplayProvider,
)
from .schedule import DailySchedule, IntervalSchedule, ReviewSchedule, SeasonSchedule, WeeklySchedule
from .settings import AgentSettings, OLLAMA, choose_providers, fetch_settings

HEARTBEAT_INTERVAL = timedelta(minutes=5)
FIELD_WATCH_INTERVAL = timedelta(minutes=30)
APP_SUGGESTIONS_INTERVAL = timedelta(minutes=30)  # the web repeats no app proposal within 24 h, so asking often costs little
HARVEST_READY_AT = time(5, 30)  # Vietnam time; early, so A9 at 06:00 reads its warnings
DISEASE_WATCH_AT = time(5, 40)  # Vietnam time
CROSS_CHECK_AT = time(5, 45)  # Vietnam time, after A3 and before A8 and A9
STAFF_TASKS_AT = time(5, 50)  # Vietnam time, after A4 and A3 and before A9, which reads the tasks
CAMPAIGN_AT = time(6, 0)  # Vietnam time, after A2, A4 and A3 (contract C5)
BULLETIN_AT = time(5, 0)  # Vietnam time
IMPROVEMENT_AT = time(6, 30)  # Vietnam time, Mondays: after the day's agents, before the 07:00 weekly report (contract C4)
STRATEGY_AT = time(6, 15)  # Vietnam time, on a quarter's first day: after A9's campaign at 06:00 (contract C5 of M11)
ASSISTANT_POLL_SECONDS = 1.5
# The web expires an assistant request after 60 s; a result must land before that.
ASSISTANT_EXTERNAL_TIMEOUT_SECONDS = 45.0

log = logging.getLogger("dxos_agent")


# The cooperative's server runs one local model, and on a CPU it serves one request at a time. A bulletin keeps it busy
# for minutes, so bulletins are written one at a time, and A1 does not queue behind one: it uses its rule reasons.
_BULLETIN_LOCK = threading.Lock()
_bulletin_on_local_model = threading.Event()


class _LocalModelBusy(LLMProvider):
    """Stands in for the local model while a bulletin is written on it; fails at once so A1 falls back to its rules."""

    def __init__(self, model: str) -> None:
        self.name = OLLAMA
        self.model = model

    def _generate(self, messages, schema) -> LLMResponse:
        del messages, schema
        raise ProviderError("the local model is writing a bulletin")


def _local_unless_busy(provider: LLMProvider | None) -> LLMProvider | None:
    if provider is not None and provider.name == OLLAMA and _bulletin_on_local_model.is_set():
        return _LocalModelBusy(provider.model)
    return provider


@dataclass
class _CooperativeRuntime:
    """Clients and schedule memory kept per cooperative across cycles, so tokens and rate-limit state persist."""

    creds: AgentCredentials
    gateway: CoreGatewayClient
    # Keyed by provider name; "ollama" is always present (Ollama, or the replay provider in CI).
    providers: dict[str, LLMProvider]
    # What the heartbeat tells the web; in replay mode it also names the providers whose keys are set (see _reported).
    reported: list[str] = field(default_factory=list)
    schedule: ReviewSchedule = field(default_factory=ReviewSchedule)
    digest: DigestSchedule = field(default_factory=DigestSchedule)
    heartbeat_at: datetime | None = None
    # M4 agents: each has its own clock, so one failing agent never delays the others.
    field_watch: IntervalSchedule = field(default_factory=lambda: IntervalSchedule(FIELD_WATCH_INTERVAL))
    harvest_ready: DailySchedule = field(default_factory=lambda: DailySchedule(HARVEST_READY_AT))
    disease_watch: DailySchedule = field(default_factory=lambda: DailySchedule(DISEASE_WATCH_AT))
    cross_check: DailySchedule = field(default_factory=lambda: DailySchedule(CROSS_CHECK_AT))
    disease_fingerprint: str | None = None
    staff_tasks: DailySchedule = field(default_factory=lambda: DailySchedule(STAFF_TASKS_AT))
    app_suggestions: IntervalSchedule = field(default_factory=lambda: IntervalSchedule(APP_SUGGESTIONS_INTERVAL))
    daily_campaign: DailySchedule = field(default_factory=lambda: DailySchedule(CAMPAIGN_AT))
    bulletin: DailySchedule = field(default_factory=lambda: DailySchedule(BULLETIN_AT))
    improvement: WeeklySchedule = field(default_factory=lambda: WeeklySchedule(IMPROVEMENT_AT))
    app_builder_backoff: app_builder.RequestBackoff = field(default_factory=app_builder.RequestBackoff)
    strategy: SeasonSchedule = field(default_factory=lambda: SeasonSchedule(STRATEGY_AT))
    # The bulletin's LLM call can take minutes on a CPU server, so it runs on its own thread (one at a time).
    bulletin_thread: threading.Thread | None = None


def _reported(cfg: Config, providers: dict[str, LLMProvider]) -> list[str]:
    """The providers the keys on this machine allow. Replay answers every model call, but the keys are still there, so
    the web keeps offering what needs them (the code tools of the mini-app factory)."""
    names = list(providers)
    if cfg.provider_name == "replay":
        names += [name for name, key in (("anthropic", cfg.anthropic_api_key), ("openai", cfg.openai_api_key)) if key]
    return names


def _build_providers(cfg: Config, token_client: KeycloakTokenClient) -> dict[str, LLMProvider]:
    """Internal provider first; external ones only where this container holds their key."""
    if cfg.provider_name == "replay":
        return {OLLAMA: ReplayProvider(replay_dir=cfg.replay_dir, model=cfg.llm_model)}
    providers: dict[str, LLMProvider] = {
        OLLAMA: OllamaProvider(
            gateway_url=cfg.gateway_url,
            token_provider=token_client.get_token,
            model=cfg.llm_model,
        ),
    }
    if cfg.anthropic_api_key:
        providers["anthropic"] = AnthropicProvider(
            api_key=cfg.anthropic_api_key,
            default_model=cfg.anthropic_model,
            base_url=cfg.anthropic_api_base,
        )
    if cfg.openai_api_key:
        providers["openai"] = OpenAIProvider(
            api_key=cfg.openai_api_key,
            default_model=cfg.openai_model,
            base_url=cfg.openai_api_base,
        )
    return providers


def _runtime_for(
    cfg: Config,
    runtimes: dict[str, _CooperativeRuntime],
    creds: AgentCredentials,
) -> _CooperativeRuntime:
    runtime = runtimes.get(creds.htx_code)
    if runtime is None or runtime.creds != creds:
        token_client = KeycloakTokenClient(cfg.keycloak_url, creds)
        runtime = _CooperativeRuntime(
            creds=creds,
            gateway=CoreGatewayClient(cfg.gateway_url, token_client.get_token),
            providers=_build_providers(cfg, token_client),
        )
        runtime.reported = _reported(cfg, runtime.providers)
        runtimes[creds.htx_code] = runtime
    return runtime


def _assistant_runtime_for(
    cfg: Config,
    runtimes: dict[str, _CooperativeRuntime],
    creds: AgentCredentials,
) -> _CooperativeRuntime:
    """The assistant thread's own providers: its external calls stop at 45 s, and A1's providers keep theirs."""
    runtime = runtimes.get(creds.htx_code)
    if runtime is None or runtime.creds != creds:
        token_client = KeycloakTokenClient(cfg.keycloak_url, creds)
        providers = _build_providers(cfg, token_client)
        for provider in providers.values():
            if provider.external:
                provider.timeout_seconds = ASSISTANT_EXTERNAL_TIMEOUT_SECONDS
        runtime = _CooperativeRuntime(
            creds=creds,
            gateway=CoreGatewayClient(cfg.gateway_url, token_client.get_token),
            providers=providers,
        )
        runtimes[creds.htx_code] = runtime
    return runtime


def run_assistant_cycle(
    cfg: Config,
    runtimes: dict[str, _CooperativeRuntime],
    now: datetime,
) -> None:
    """Answer the pending assistant requests of every cooperative with credentials; one failure never stops the rest."""
    credentials_list = load_all_agent_credentials(cfg.env_dir)
    active = {creds.htx_code for creds in credentials_list}
    for htx_code in [code for code in runtimes if code not in active]:
        del runtimes[htx_code]

    for creds in credentials_list:
        try:
            runtime = _assistant_runtime_for(cfg, runtimes, creds)
            providers = {name: _local_unless_busy(provider) for name, provider in runtime.providers.items()}
            run_assistant_once(runtime.gateway, providers, lambda: fetch_settings(runtime.gateway), now)
        except Exception:
            log.exception("A7 assistant failed for htx=%s", creds.htx_code)


def _assistant_loop(cfg: Config, runtimes: dict[str, _CooperativeRuntime], stop: threading.Event) -> None:
    """Poll for chat requests on a thread of its own, so a slow A1 or bulletin never delays a chat answer."""
    while not stop.is_set():
        try:
            run_assistant_cycle(cfg, runtimes, datetime.now(timezone.utc))
        except Exception:
            log.exception("A7 assistant poll failed")
        time_module.sleep(ASSISTANT_POLL_SECONDS)


def _digest_and_heartbeat(runtime: _CooperativeRuntime, now: datetime, settings: AgentSettings) -> None:
    """A6 and the heartbeat never affect A1: each failure is logged here and the cycle goes on."""
    try:
        run_digest(runtime.gateway, runtime.digest, now, daily_at=settings.report_time_of_day())
    except Exception:
        log.exception("A6 digest failed for htx=%s", runtime.creds.htx_code)
    if runtime.heartbeat_at is None or now - runtime.heartbeat_at >= HEARTBEAT_INTERVAL:
        try:
            runtime.gateway.heartbeat(__version__, runtime.reported or list(runtime.providers))
            runtime.heartbeat_at = now
        except Exception:
            log.warning("Agent heartbeat failed for htx=%s", runtime.creds.htx_code)


def labs_enabled() -> bool:
    """Frozen features (ADR 0005) run only when DXOS_LABS is "1" or "true"; the same rule as the web. Read at call time."""
    return os.environ.get("DXOS_LABS", "").strip().lower() in ("1", "true")


def _guarded(label: str, htx_code: str, run) -> None:
    """Run one M4 agent; its failure is logged and the other agents and A1 go on."""
    try:
        run()
    except Exception:
        log.exception("%s failed for htx=%s", label, htx_code)


def _run_m4_agents(runtime: _CooperativeRuntime, now: datetime, settings: AgentSettings) -> None:
    """A2 to A5 and A8 (rules, plus the bulletin's LLM). They run for every cooperative with credentials, as A1 does."""
    htx = runtime.creds.htx_code
    gateway = runtime.gateway

    def field_watch_cycle() -> None:
        if runtime.field_watch.is_due(now):
            field_watch.run_field_watch(gateway, now, settings.thresholds_for(field_watch.AGENT_NAME))
            runtime.field_watch.record(now)  # only after a run that did not fail, so a failed run is retried

    def harvest_cycle() -> None:
        if runtime.harvest_ready.is_due(now):
            harvest_ready.run_harvest_ready(gateway, now, settings.thresholds_for(harvest_ready.AGENT_NAME))
            runtime.harvest_ready.record(now)

    def disease_cycle() -> None:
        # The reports are read every cycle; A3 runs on its daily time or when the window's reports changed.
        thresholds = settings.thresholds_for(disease_watch.AGENT_NAME)
        window = disease_watch.fetch_window(gateway, now, thresholds)
        fingerprint = disease_watch.window_fingerprint(window[0])
        daily_due = runtime.disease_watch.is_due(now)
        if not daily_due and fingerprint == runtime.disease_fingerprint:
            return
        disease_watch.run_disease_watch(gateway, now, thresholds, window=window)
        if daily_due:
            runtime.disease_watch.record(now)
        runtime.disease_fingerprint = fingerprint

    def cross_check_cycle() -> None:
        if runtime.cross_check.is_due(now):
            _run_cross_check(gateway, now, settings)
            runtime.cross_check.record(now)  # only after a run that did not fail, so a failed run is retried

    def staff_tasks_cycle() -> None:
        if runtime.staff_tasks.is_due(now):
            staff_tasks.run_staff_tasks(gateway, now)
            runtime.staff_tasks.record(now)  # only after a run that did not fail, so a failed run is retried

    def app_suggestions_cycle() -> None:
        if runtime.app_suggestions.is_due(now):
            app_suggestions.run_app_suggestions(gateway, now)
            runtime.app_suggestions.record(now)  # one failing app is logged inside; a failure of the list itself is retried

    def campaign_cycle() -> None:
        if not runtime.daily_campaign.is_due(now):
            return
        provider, fallback = choose_providers(settings, daily_campaign.AGENT_NAME, runtime.providers)
        provider, fallback = _local_unless_busy(provider), _local_unless_busy(fallback)
        chain = [provider] if fallback is None else [provider, fallback]
        daily_campaign.run_daily_campaign(gateway, now, chain)
        runtime.daily_campaign.record(now)  # only after a run that did not fail, so a failed run is retried

    def bulletin_cycle() -> None:
        if runtime.bulletin_thread is not None and runtime.bulletin_thread.is_alive():
            return  # still writing the last one
        if not runtime.bulletin.is_due(now):
            return
        provider, fallback = choose_providers(settings, bulletin.AGENT_NAME, runtime.providers)
        thresholds = settings.thresholds_for(bulletin.AGENT_NAME)

        def write() -> None:
            with _BULLETIN_LOCK:  # one bulletin at a time on the shared server
                on_local_model = OLLAMA in {provider.name, fallback.name if fallback is not None else None}
                if on_local_model:
                    _bulletin_on_local_model.set()
                try:
                    bulletin.run_bulletin(gateway, now, provider, thresholds, fallback)
                except Exception:
                    log.exception("A5 bulletin failed for htx=%s", htx)
                    return
                finally:
                    _bulletin_on_local_model.clear()
            runtime.bulletin.record(now)  # only after a run that did not fail, so a failed run is retried

        runtime.bulletin_thread = threading.Thread(target=write, name=f"bulletin-{htx}", daemon=True)
        runtime.bulletin_thread.start()

    def improvement_cycle() -> None:
        if not runtime.improvement.is_due(now):
            return
        provider, fallback = choose_providers(settings, improvement.AGENT_NAME, runtime.providers)
        provider, fallback = _local_unless_busy(provider), _local_unless_busy(fallback)
        chain = [provider] if fallback is None else [provider, fallback]
        improvement.run_improvement(gateway, now, chain)
        runtime.improvement.record(now)  # a finished or refused week is done; a raised failure is retried next cycle

    def app_builder_cycle() -> None:
        # Cheap when no request waits: one list call, and no model is asked.
        provider, fallback = choose_providers(settings, app_builder.AGENT_NAME, runtime.providers)
        provider, fallback = _local_unless_busy(provider), _local_unless_busy(fallback)
        app_builder.run_app_builder(gateway, now, [provider] if fallback is None else [provider, fallback], runtime.app_builder_backoff)

    def strategy_cycle() -> None:
        if not runtime.strategy.is_due(now):
            return
        provider, fallback = choose_providers(settings, strategy.AGENT_NAME, runtime.providers)
        provider, fallback = _local_unless_busy(provider), _local_unless_busy(fallback)
        chain = [provider] if fallback is None else [provider, fallback]
        strategy.run_strategy(gateway, now, chain)
        runtime.strategy.record(now)  # a drafted, skipped or refused quarter is done; a raised failure is retried next cycle

    _guarded("A2 field-watch", htx, field_watch_cycle)
    _guarded("A4 harvest-ready", htx, harvest_cycle)
    _guarded("A3 disease-watch", htx, disease_cycle)
    _guarded("A13 cross-check", htx, cross_check_cycle)
    labs = labs_enabled()  # frozen agents are not scheduled at all, so no call reaches a 404 route
    if labs:
        _guarded("A8 staff-tasks", htx, staff_tasks_cycle)
    _guarded("app suggestions", htx, app_suggestions_cycle)  # before A9, so the campaign sees them
    _guarded("A9 daily-campaign", htx, campaign_cycle)
    _guarded("A5 bulletin", htx, bulletin_cycle)
    _guarded("A10 improvement", htx, improvement_cycle)
    if labs:
        _guarded("A12 app-builder", htx, app_builder_cycle)
        _guarded("A11 strategy", htx, strategy_cycle)


def _run_cross_check(gateway: CoreGatewayClient, now: datetime, settings: AgentSettings) -> None:
    """The one call of A13: the daily schedule and `--once cross-check` both go through here."""
    cross_check.run_cross_check(gateway, now, settings.thresholds_for(cross_check.AGENT_NAME))


def run_cross_check_once(cfg: Config, htx_code: str, now: datetime | None = None) -> None:
    """Run A13 now for one cooperative, for a demo: same call and thresholds as the daily schedule, no schedule check."""
    creds = next((c for c in load_all_agent_credentials(cfg.env_dir) if c.htx_code == htx_code), None)
    if creds is None:
        raise SystemExit(f"Không có thông tin đăng nhập agent cho HTX {htx_code}: chạy ./dxos agent enable {htx_code} trước")
    runtime = _runtime_for(cfg, {}, creds)
    _run_cross_check(runtime.gateway, now or datetime.now(timezone.utc), fetch_settings(runtime.gateway))


def run_once(
    cfg: Config,
    runtimes: dict[str, _CooperativeRuntime],
    now: datetime | None = None,
) -> None:
    """Read each cooperative's pending queue and run A1 only when the schedule says so."""
    now = now or datetime.now(timezone.utc)
    credentials_list = load_all_agent_credentials(cfg.env_dir)
    active = {creds.htx_code for creds in credentials_list}
    for htx_code in [code for code in runtimes if code not in active]:
        del runtimes[htx_code]

    for creds in credentials_list:
        try:
            runtime = _runtime_for(cfg, runtimes, creds)
            settings = fetch_settings(runtime.gateway)
            _digest_and_heartbeat(runtime, now, settings)
        except Exception:
            log.exception("A1 journal-review failed for htx=%s", creds.htx_code)
            continue
        _guarded("A1 journal-review", creds.htx_code, lambda: _journal_review_cycle(runtime, now, settings))
        # The M4 agents come after A1: the bulletin's LLM call can take minutes and must not delay the journal review.
        _run_m4_agents(runtime, now, settings)
        # Cheap when the mode is off; the web re-checks every condition, so a failed tick only delays the run.
        if labs_enabled():
            _guarded("autopilot tick", creds.htx_code, runtime.gateway.post_autopilot_tick)


def _journal_review_cycle(runtime: _CooperativeRuntime, now: datetime, settings: AgentSettings) -> None:
    entries = fetch_pending_entries(runtime.gateway)
    input_hash = pending_evidence_hash(entries)
    # Nothing pending means no run row and no LLM call, even on the first cycle.
    due = bool(entries) and runtime.schedule.is_due(now, input_hash)
    runtime.schedule.record(now, input_hash, ran=due)
    if not due:
        return
    provider, fallback = choose_providers(settings, JOURNAL_REVIEW_AGENT, runtime.providers)
    provider, fallback = _local_unless_busy(provider), _local_unless_busy(fallback)
    outcome = run_journal_review(
        gateway=runtime.gateway,
        provider=provider,
        trigger="schedule",
        now=now,
        entries=entries,
        fallback=fallback,
    )
    log.info(
        "A1 journal-review htx=%s run=%s status=%s scanned=%d submitted=%d deduped=%d",
        runtime.creds.htx_code,
        outcome.run_id,
        outcome.status,
        outcome.entries_scanned,
        outcome.proposals_submitted,
        outcome.proposals_deduped,
    )


def main(stop: threading.Event | None = None, argv: list[str] | None = None) -> None:
    """Run the scheduled agent loop and heartbeat until a termination signal arrives.

    `--once cross-check --htx <CODE>` runs A13 once through the same call the daily schedule makes, then exits."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = Config.from_env()
    args = argv or []
    if args:
        parser = argparse.ArgumentParser(prog="python -m dxos_agent", description=main.__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
        parser.add_argument("--once", choices=["cross-check"], required=True, help="run this agent once through its scheduled code path")
        parser.add_argument("--htx", required=True, help="cooperative code, for example TC")
        parsed = parser.parse_args(args)
        run_cross_check_once(cfg, parsed.htx)
        return
    stop = stop or threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    heartbeat = Path(cfg.heartbeat_path)
    # `docker kill -s SIGUSR1 <container>` prints every thread's stack to the log, for a loop that stops moving.
    faulthandler.register(signal.SIGUSR1, all_threads=True)
    log.info("dxos-agent started (provider=%s, env_dir=%s)", cfg.provider_name, cfg.env_dir)

    runtimes: dict[str, _CooperativeRuntime] = {}
    # The assistant keeps its own runtimes, so its thread never touches the dict the main loop changes.
    threading.Thread(
        target=_assistant_loop,
        args=(cfg, {}, stop),
        name="assistant",
        daemon=True,
    ).start()
    while not stop.is_set():
        heartbeat.touch()
        run_once(cfg, runtimes)
        heartbeat.touch()
        stop.wait(cfg.interval_seconds)


if __name__ == "__main__":
    main(argv=sys.argv[1:])
