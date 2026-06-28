"""
Agent Nano Bricks — Model Fallback
When the primary model fails fatally (server error, bad request), the agent
automatically falls back to a backup model instead of dying.

Mirrors Hermes Agent's provider failover, scoped to our DeepSeek/OpenRouter set.
"""
from __future__ import annotations

# Ordered fallback chains. The loop walks down the chain on fatal model errors.
_FALLBACK_CHAINS = {
    "deepseek-v4-flash":  ["deepseek-v4-flash", "deepseek-chat", "deepseek-v4-pro"],
    "deepseek-v4-pro":    ["deepseek-v4-pro", "deepseek-reasoner", "deepseek-v4-flash"],
    "deepseek-reasoner":  ["deepseek-reasoner", "deepseek-v4-pro", "deepseek-v4-flash"],
    "deepseek-chat":      ["deepseek-chat", "deepseek-v4-flash"],
}


def fallback_chain(model: str) -> list[str]:
    """Return the ordered list of models to try, starting with the primary."""
    bare = model.split("/")[-1]
    chain = _FALLBACK_CHAINS.get(bare)
    if chain:
        # Preserve any provider prefix the caller used
        prefix = model[: len(model) - len(bare)]
        return [prefix + m for m in chain]
    return [model]


def next_model(current: str, chain: list[str]) -> str | None:
    """Given the current model and its chain, return the next fallback or None."""
    try:
        i = chain.index(current)
    except ValueError:
        return None
    return chain[i + 1] if i + 1 < len(chain) else None
