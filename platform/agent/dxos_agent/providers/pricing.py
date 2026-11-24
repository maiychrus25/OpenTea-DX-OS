# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Estimated cost of external LLM calls, in USD per million tokens."""
import logging

log = logging.getLogger("dxos_agent")

# shortcut: only the listed models are priced, others cost 0 with a warning; add a row when a cooperative enables a new model.
# Anthropic: platform.claude.com/docs/en/about-claude/pricing, read 2026-11-25; prompts over 100k tokens cost more, not modelled.
# OpenAI: developers.openai.com/api/docs/pricing, read 2026-11-25 (the page shows no date); standard tier, short context.
PRICES_PER_MTOK: dict[str, tuple[float, float]] = {
    "claude-haiku-5-5": (0.10, 0.50),
    "gpt-6-luna": (0.10, 0.50),
    "gpt-5.4-mini": (0.75, 4.50),
    "gpt-5-mini": (0.25, 2.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4o-mini": (0.15, 0.60),
}


def estimate_cost_usd(model: str, tokens_in: int, tokens_out: int) -> float:
    prices = PRICES_PER_MTOK.get(model)
    if prices is None:
        log.warning("No price known for model %s; its cost is recorded as 0", model)
        return 0.0
    input_price, output_price = prices
    return (tokens_in * input_price + tokens_out * output_price) / 1_000_000
