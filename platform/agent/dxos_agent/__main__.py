# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Entrypoint for dxos-agent executing scheduled per-cooperative operational agents."""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import logging
from pathlib import Path
import signal
import threading

from . import __version__
from .agents.digest import DigestSchedule, run_digest
from .agents.journal_review import (
    AGENT_NAME as JOURNAL_REVIEW_AGENT,
    fetch_pending_entries,
    pending_evidence_hash,
    run_journal_review,
)
from .client import AgentCredentials, CoreGatewayClient, KeycloakTokenClient, load_all_agent_credentials
from .config import Config
from .providers import AnthropicProvider, LLMProvider, OllamaProvider, OpenAIProvider, ReplayProvider
from .schedule import ReviewSchedule
from .settings import AgentSettings, OLLAMA, choose_providers, fetch_settings

HEARTBEAT_INTERVAL = timedelta(minutes=5)

log = logging.getLogger("dxos_agent")


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
            entries = fetch_pending_entries(runtime.gateway)
            input_hash = pending_evidence_hash(entries)
            # Nothing pending means no run row and no LLM call, even on the first cycle.
            due = bool(entries) and runtime.schedule.is_due(now, input_hash)
            runtime.schedule.record(now, input_hash, ran=due)
            if not due:
                continue
            provider, fallback = choose_providers(settings, JOURNAL_REVIEW_AGENT, runtime.providers)
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
                creds.htx_code,
                outcome.run_id,
                outcome.status,
                outcome.entries_scanned,
                outcome.proposals_submitted,
                outcome.proposals_deduped,
            )
        except Exception:
            log.exception("A1 journal-review failed for htx=%s", creds.htx_code)


def main(stop: threading.Event | None = None) -> None:
    """Run the scheduled agent loop and heartbeat until a termination signal arrives."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = Config.from_env()
    stop = stop or threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    heartbeat = Path(cfg.heartbeat_path)
    log.info("dxos-agent started (provider=%s, env_dir=%s)", cfg.provider_name, cfg.env_dir)

    runtimes: dict[str, _CooperativeRuntime] = {}
    while not stop.is_set():
        heartbeat.touch()
        run_once(cfg, runtimes)
        heartbeat.touch()
        stop.wait(cfg.interval_seconds)


if __name__ == "__main__":
    main()
