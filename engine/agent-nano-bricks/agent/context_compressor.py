"""
Agent Nano Bricks — Context Compressor
Keeps the agent running indefinitely. When the conversation history grows
close to the model's context window, older turns are summarized into a single
compact note so the model never errors out with "context length exceeded".

Mirrors Hermes Agent's conversation compression, scoped to our message format.
Pure heuristic token estimation (no tokenizer dependency) + one cheap LLM call
to summarize the dropped middle.
"""
from __future__ import annotations

import json
from typing import Optional

from openai import OpenAI

# Conservative context windows (tokens). Unknown models get a safe default.
_CONTEXT_WINDOWS = {
    "deepseek-v4-flash": 64000,
    "deepseek-v4-pro": 128000,
    "deepseek-reasoner": 64000,
    "deepseek-chat": 64000,
}
_DEFAULT_WINDOW = 32000

# Fraction of the window we allow message history to occupy before compressing.
_COMPRESS_AT = 0.70
# How many of the most-recent messages we always keep verbatim.
_KEEP_RECENT = 6


def context_window(model: str) -> int:
    bare = model.split("/")[-1]
    for key, win in _CONTEXT_WINDOWS.items():
        if key in bare:
            return win
    return _DEFAULT_WINDOW


def estimate_tokens(messages: list[dict]) -> int:
    """Rough token estimate: ~4 chars/token over all serialized content."""
    total = 0
    for m in messages:
        c = m.get("content")
        if isinstance(c, str):
            total += len(c)
        elif isinstance(c, list):
            total += sum(len(json.dumps(part)) for part in c)
        for tc in m.get("tool_calls", []) or []:
            total += len(json.dumps(tc))
    return total // 4


def _summarize_block(client: OpenAI, model: str, block: list[dict]) -> str:
    """Summarize a slice of the conversation into a compact progress note."""
    transcript_parts = []
    for m in block:
        role = m.get("role", "")
        content = m.get("content", "")
        if isinstance(content, list):
            content = " ".join(json.dumps(p)[:200] for p in content)
        if m.get("tool_calls"):
            names = ", ".join(tc["function"]["name"] for tc in m["tool_calls"])
            content = (content or "") + f" [called tools: {names}]"
        if content:
            transcript_parts.append(f"{role}: {str(content)[:600]}")
    transcript = "\n".join(transcript_parts)[:8000]

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Summarize this slice of an agent's working session into a tight "
                        "progress note: what was attempted, what tools ran, what was learned, "
                        "what files changed, and what still remains. Keep all facts needed to "
                        "continue the task. 8 sentences max."
                    ),
                },
                {"role": "user", "content": transcript},
            ],
            max_tokens=400,
        )
        return resp.choices[0].message.content or "(prior work summarized)"
    except Exception:
        # Fallback: cheap extractive summary
        return "Earlier in this session: " + transcript[:600]


def maybe_compress(
    messages: list[dict],
    client: OpenAI,
    model: str,
    force: bool = False,
) -> tuple[list[dict], bool]:
    """If history is too large, compress the middle. Returns (messages, did_compress).

    Structure preserved:
      [ system, ...summary note..., <recent KEEP_RECENT messages> ]

    Never drops the leading system message or the most recent turns. Also
    guards against splitting an assistant tool_call from its tool result.

    ``force=True`` bypasses the budget check — used when the provider itself
    rejected the request for being too long.
    """
    window = context_window(model)
    budget = int(window * _COMPRESS_AT)
    if not force and estimate_tokens(messages) < budget:
        return messages, False

    if len(messages) <= _KEEP_RECENT + 2:
        return messages, False  # too short to safely compress

    # Leading system message(s)
    head_end = 0
    while head_end < len(messages) and messages[head_end].get("role") == "system":
        head_end += 1
    head = messages[:head_end]

    # Recent tail — but don't start the tail on a 'tool' message (it must follow
    # its assistant tool_call), walk back until we're at a clean boundary.
    tail_start = max(head_end, len(messages) - _KEEP_RECENT)
    while tail_start < len(messages) and messages[tail_start].get("role") == "tool":
        tail_start += 1
    tail = messages[tail_start:]

    middle = messages[head_end:tail_start]
    if not middle:
        return messages, False

    note = _summarize_block(client, model, middle)

    # Fold the summary into the LAST leading system message rather than inserting
    # a new system message mid-conversation — the latter is rejected by some
    # strict OpenAI-compatible providers. This keeps the message sequence valid
    # everywhere: [system(+summary), <recent tail>].
    head = [dict(m) for m in head]  # copy so we don't mutate caller's messages
    block = f"\n\n[COMPRESSED HISTORY — earlier turns this session]\n{note}"
    if head and head[-1].get("role") == "system":
        head[-1]["content"] = (head[-1].get("content") or "") + block
    else:
        head = head + [{"role": "system", "content": block.strip()}]

    new_messages = head + tail
    return new_messages, True
