# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Entrypoint for dxos-agent executing scheduled per-cooperative operational agents."""
import logging
from pathlib import Path
import signal
import threading

from .agents import run_journal_review
from .client import CoreGatewayClient, KeycloakTokenClient, load_all_agent_credentials
from .config import Config
from .providers import LLMProvider, OllamaProvider, ReplayProvider

log = logging.getLogger("dxos_agent")


def _build_provider(cfg: Config, token_client: KeycloakTokenClient) -> LLMProvider:
    if cfg.provider_name == "replay":
        return ReplayProvider(replay_dir=cfg.replay_dir, model=cfg.llm_model)
    return OllamaProvider(
        gateway_url=cfg.gateway_url,
        token_provider=token_client.get_token,
        model=cfg.llm_model,
    )


def run_once(cfg: Config) -> None:
    """Run one cycle of agent A1 for every cooperative with an enabled agent env file."""
    credentials_list = load_all_agent_credentials(cfg.env_dir)
    for creds in credentials_list:
        token_client = KeycloakTokenClient(cfg.keycloak_url, creds)
        gateway = CoreGatewayClient(cfg.gateway_url, token_client.get_token)
        provider = _build_provider(cfg, token_client)
        try:
            outcome = run_journal_review(gateway=gateway, provider=provider, trigger="schedule")
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

    while not stop.is_set():
        heartbeat.touch()
        run_once(cfg)
        heartbeat.touch()
        stop.wait(cfg.interval_seconds)


if __name__ == "__main__":
    main()
