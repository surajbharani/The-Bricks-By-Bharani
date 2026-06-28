"""
Agent Nano Bricks — Iteration Budget
Picks a step budget that fits the task instead of a flat number. Simple tasks
finish fast; complex multi-part tasks get room to run.

Mirrors Hermes Agent's iteration_budget.
"""
from __future__ import annotations

import re

# Hard ceiling regardless of complexity.
HARD_MAX = 80
# Generous floor — the agent stops when the task is actually DONE (done-detection),
# not when it hits the cap. A high floor guarantees it never stops early on a task
# that turned out to need more steps than it first looked.
MIN_STEPS = 30

# Signals that a task is large / multi-part.
_COMPLEX_SIGNALS = [
    "and then", "after that", "for each", "all of", "every", "multiple",
    "step by step", "first", "second", "finally", "then", "also",
    "build", "implement", "refactor", "migrate", "scrape", "crawl",
    "test", "deploy", "analyze", "research", "compare", "generate report",
]


def estimate_budget(query: str, requested_max: int | None = None) -> int:
    """Return a step budget for this task."""
    q = (query or "").lower()
    length = len(query or "")

    score = MIN_STEPS
    # Longer prompts → more steps
    score += min(length // 120, 20)
    # Complexity keywords
    hits = sum(1 for s in _COMPLEX_SIGNALS if s in q)
    score += hits * 4
    # Explicit enumerated lists (1. 2. 3.)
    enumerated = len(re.findall(r"(?:^|\n)\s*\d+[\.\)]", query or ""))
    score += enumerated * 3

    budget = max(MIN_STEPS, min(score, HARD_MAX))
    # `requested_max` is treated as a CEILING only — and only if it is itself
    # generous (>= MIN_STEPS). A small requested value must never force the agent
    # to stop early, which is the whole point of a high floor.
    if requested_max and requested_max >= MIN_STEPS:
        budget = min(budget, requested_max)
    return budget
