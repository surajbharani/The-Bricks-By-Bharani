"""
Decompose a task into independent bricks for parallel execution.
Falls back to Solo on any parse failure — never crashes.
"""
import json
import re
from openai import OpenAI

MAX_BRICKS = 8

_DECOMPOSE_PROMPT = """You are a task decomposition expert. Break the user's task into independent parallel sub-tasks called "bricks".

Rules:
- Each brick must be independently executable (no implicit ordering unless explicitly marked as a dependency).
- Prefer parallel work. Only add a 'needs' dependency when a brick literally requires another's output.
- Keep brick goals concise (1-2 sentences).
- Maximum {max_bricks} bricks.
- Output ONLY valid JSON in this exact format:

{{
  "bricks": [
    {{"id": "b1", "goal": "...", "needs": [], "accept": "...", "toolsets": ["file"]}},
    {{"id": "b2", "goal": "...", "needs": ["b1"], "accept": "...", "toolsets": ["file", "shell"]}}
  ]
}}

Toolsets available: "file" (read/write files), "shell" (execute commands).
The "accept" field is a one-line acceptance criterion.
If the task cannot be parallelized, return a single brick."""


def decompose(query: str, model: str, client: OpenAI, max_bricks: int = MAX_BRICKS) -> list[dict] | None:
    """
    Returns list of brick dicts, or None if decomposition fails (caller falls back to Solo).
    """
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _DECOMPOSE_PROMPT.format(max_bricks=max_bricks)},
                {"role": "user", "content": query},
            ],
            max_tokens=1024,
        )
        text = resp.choices[0].message.content or ""
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return None
        data = json.loads(m.group())
        bricks = data.get("bricks", [])
        if not isinstance(bricks, list) or not bricks:
            return None
        # Validate brick schema
        validated = []
        for b in bricks[:max_bricks]:
            if not isinstance(b, dict) or "id" not in b or "goal" not in b:
                continue
            validated.append({
                "id": str(b["id"]),
                "goal": str(b["goal"]),
                "needs": [str(n) for n in b.get("needs", [])],
                "accept": str(b.get("accept", "")),
                "toolsets": list(b.get("toolsets", ["file"])),
            })
        return validated if validated else None
    except Exception:
        return None
