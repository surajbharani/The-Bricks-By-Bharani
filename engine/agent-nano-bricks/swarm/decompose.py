"""
Decompose a task into independent parallel bricks.
Falls back gracefully — never crashes serve.py.
"""
import json
import re

from openai import OpenAI

MAX_BRICKS = 8

_DECOMPOSE_SYSTEM = """You are a task decomposition expert for a parallel AI agent system.

Break the user's task into independent sub-tasks ("bricks") that can run simultaneously.

Rules:
- Maximize parallelism. Only add a 'needs' dependency when brick B literally cannot start without brick A's output.
- Each brick must be self-contained and independently executable.
- Keep goal descriptions concise (1-2 sentences).
- Maximum {max_bricks} bricks. If the task is purely sequential, use 1-2 bricks.
- Output ONLY valid JSON. No markdown, no explanation.

Output format:
{{
  "bricks": [
    {{"id": "b1", "goal": "Research X and write a summary", "needs": []}},
    {{"id": "b2", "goal": "Research Y and write a report", "needs": []}},
    {{"id": "b3", "goal": "Combine summaries from b1 and b2 into final document", "needs": ["b1", "b2"]}}
  ]
}}"""


def decompose(query: str, model: str, client: OpenAI, max_bricks: int = MAX_BRICKS) -> list[dict] | None:
    """
    Returns list of brick dicts or None (caller falls back to solo).
    Guaranteed not to raise.
    """
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _DECOMPOSE_SYSTEM.format(max_bricks=max_bricks)},
                {"role": "user", "content": query},
            ],
            max_tokens=1024,
        )
        text = resp.choices[0].message.content or ""

        # Extract JSON even if model adds markdown fences
        text = re.sub(r"```(?:json)?", "", text).strip()
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return None

        data = json.loads(m.group())
        raw_bricks = data.get("bricks", [])
        if not isinstance(raw_bricks, list) or not raw_bricks:
            return None

        validated = []
        seen_ids: set[str] = set()
        for b in raw_bricks[:max_bricks]:
            if not isinstance(b, dict):
                continue
            bid = str(b.get("id", f"b{len(validated)+1}"))
            goal = str(b.get("goal", "")).strip()
            needs = [str(n) for n in b.get("needs", []) if str(n) in seen_ids]
            if not goal:
                continue
            validated.append({"id": bid, "goal": goal, "needs": needs})
            seen_ids.add(bid)

        return validated if validated else None
    except Exception:
        return None
