# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Entrypoint for dxos-agent executing scheduled per-cooperative operational agents."""
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone
import faulthandler
import logging
from pathlib import Path
import signal
import threading
import time as time_module

from . import __version__
from .agents import bulletin, daily_campaign, disease_watch, field_watch, harvest_ready
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
from .schedule import DailySchedule, IntervalSchedule, ReviewSchedule
from .settings import AgentSettings, OLLAMA, choose_providers, fetch_settings

HEARTBEAT_INTERVAL = timedelta(minutes=5)
FIELD_WATCH_INTERVAL = timedelta(minutes=30)
HARVEST_READY_AT = time(5, 30)  # Vietnam time; early, so A9 at 06:00 reads its warnings
DISEASE_WATCH_AT = time(5, 40)  # Vietnam time
CAMPAIGN_AT = time(6, 0)  # Vietnam time, after A2, A4 and A3 (contract C5)
BULLETIN_AT = time(5, 0)  # Vietnam time
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
    schedule: ReviewSchedule = field(default_factory=ReviewSchedule)
    digest: DigestSchedule = field(default_factory=DigestSchedule)
    heartbeat_at: datetime | None = None
    # M4 agents: each has its own clock, so one failing agent never delays the others.
    field_watch: IntervalSchedule = field(default_factory=lambda: IntervalSchedule(FIELD_WATCH_INTERVAL))
    harvest_ready: DailySchedule = field(default_factory=lambda: DailySchedule(HARVEST_READY_AT))
    disease_watch: DailySchedule = field(default_factory=lambda: DailySchedule(DISEASE_WATCH_AT))
    disease_fingerprint: str | None = None
    daily_campaign: DailySchedule = field(default_factory=lambda: DailySchedule(CAMPAIGN_AT))
    bulletin: DailySchedule = field(default_factory=lambda: DailySchedule(BULLETIN_AT))
    # The bulletin's LLM call can take minutes on a CPU server, so it runs on its own thread (one at a time).
    bulletin_thread: threading.Thread | None = None


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
            runtime.gateway.heartbeat(__version__, list(runtime.providers))
            runtime.heartbeat_at = now
        except Exception:
            log.warning("Agent heartbeat failed for htx=%s", runtime.creds.htx_code)


def _guarded(label: str, htx_code: str, run) -> None:
    """Run one M4 agent; its failure is logged and the other agents and A1 go on."""
    try:
        run()
    except Exception:
        log.exception("%s failed for htx=%s", label, htx_code)


def _run_m4_agents(runtime: _CooperativeRuntime, now: datetime, settings: AgentSettings) -> None:
    """A2 to A5 (rules, plus the bulletin's LLM). They run for every cooperative with credentials, as A1 does."""
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

    _guarded("A2 field-watch", htx, field_watch_cycle)
    _guarded("A4 harvest-ready", htx, harvest_cycle)
    _guarded("A3 disease-watch", htx, disease_cycle)
    _guarded("A9 daily-campaign", htx, campaign_cycle)
    _guarded("A5 bulletin", htx, bulletin_cycle)


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


def main(stop: threading.Event | None = None) -> None:
    """Run the scheduled agent loop and heartbeat until a termination signal arrives."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = Config.from_env()
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
    main()
