#!/usr/bin/env python3
"""
Agent Nano Bricks — stdio JSON-lines sidecar server.

Protocol (stdin → stdout):
  Request (one JSON line on stdin):
    {
      "query":         str,           # task to execute
      "mode":          "solo"|"swarm",
      "model":         str,           # e.g. "deepseek-v4-flash"
      "workspace":     str,           # absolute path for agent files
      "token":         str,           # Supabase JWT (for proxy)
      "openrouter_key": str,          # optional OpenRouter API key
      "deepseek_key":  str,           # optional DeepSeek API key
      "caps": {
        "max_steps":       int,       # default 60
        "max_concurrency": int,       # default 6 (swarm)
      }
    }

  Response (stream of AgentEvent JSON lines on stdout):
    {"t": "plan",       "steps": [...]}
    {"t": "thinking",   "text": "..."}
    {"t": "step",       "i": 0, "label": "...", "status": "run|ok|fail"}
    {"t": "tool_call",  "name": "...", "inputSummary": "..."}
    {"t": "tool_result","name": "...", "outputSummary": "...", "ok": true}
    {"t": "file",       "path": "...", "action": "write|edit"}
    {"t": "token",      "text": "..."}
    {"t": "subagent",   "id": "...", "brick": "...", "name": "...", "status": "spawned|working|done"}
    {"t": "spend",      "tokens": 0, "inr": 0.0}
    {"t": "done",       "ok": true, "summary": "...", "tokensUsed": 0}
    {"t": "error",      "message": "..."}
"""
import json
import sys
import os
from pathlib import Path

# Force UTF-8 I/O on all platforms
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")


def _emit_error(message: str) -> None:
    print(json.dumps({"t": "error", "message": message}), flush=True)


def main() -> None:
    # ── Parse request ─────────────────────────────────────────────────────────
    try:
        raw = sys.stdin.readline()
        if not raw.strip():
            _emit_error("Empty request received.")
            return
        req = json.loads(raw)
    except json.JSONDecodeError as e:
        _emit_error(f"Invalid JSON request: {e}")
        return
    except Exception as e:
        _emit_error(f"Failed to read request: {e}")
        return

    query          = req.get("query", "").strip()
    mode           = req.get("mode", "solo")
    model          = req.get("model", "deepseek-v4-flash")
    workspace      = Path(req.get("workspace", str(Path.home() / "Documents" / "NanoBricks")))
    jwt            = req.get("token", "")
    openrouter_key = req.get("openrouter_key", "")
    deepseek_key   = req.get("deepseek_key", "")
    caps           = req.get("caps", {})

    # Apply defaults to caps
    caps.setdefault("max_steps", 60)
    caps.setdefault("max_concurrency", 6)

    if not query:
        _emit_error("Query is empty.")
        return

    # ── Build client ──────────────────────────────────────────────────────────
    from providers.proxy import make_client, make_openrouter_client, make_deepseek_client, normalize_model

    # Normalize model name (strip provider prefix for direct API calls)
    bare_model = normalize_model(model)

    use_deepseek   = bool(deepseek_key) and ("deepseek" in model.lower())
    use_openrouter = bool(openrouter_key) and (
        model.startswith("openrouter/") or not jwt or jwt == "dev-token"
    )

    if use_deepseek:
        client = make_deepseek_client(deepseek_key)
        model = bare_model
    elif use_openrouter:
        client = make_openrouter_client(openrouter_key)
        model = bare_model
    elif jwt:
        client = make_client(jwt)
        # Proxy expects the full prefixed model name
    else:
        _emit_error("No API key or token provided. Please sign in to Nano Bricks.")
        return

    workspace.mkdir(parents=True, exist_ok=True)

    # ── Dispatch ──────────────────────────────────────────────────────────────
    if mode == "swarm":
        _run_swarm(query, model, workspace, jwt, client, caps)
    else:
        _run_solo(query, model, workspace, client, caps)


def _run_solo(query, model, workspace, client, caps):
    from agent.loop import run_solo
    try:
        run_solo(query, model, workspace, client, caps, emit_identity=True)
    except Exception as e:
        _emit_error(f"Agent error: {e}")


def _run_swarm(query, model, workspace, jwt, client, caps):
    from swarm.decompose import decompose
    from swarm.scheduler import run_swarm
    from agent.events import emit_thinking
    from agent.loop import run_solo

    emit_thinking("Analyzing task for parallel execution…")

    bricks = decompose(query, model, client)

    if not bricks or len(bricks) <= 1:
        emit_thinking("Task is best handled by a single agent.")
        _run_solo(query, model, workspace, client, caps)
        return

    emit_thinking(f"Spawning {len(bricks)} parallel agents…")
    try:
        result = run_swarm(query, bricks, model, workspace, jwt, caps, client=client)
        if not result.get("ok"):
            _emit_error("Swarm completed with one or more failures. See brick summaries above.")
    except Exception as e:
        _emit_error(f"Swarm error: {e}")


if __name__ == "__main__":
    main()
