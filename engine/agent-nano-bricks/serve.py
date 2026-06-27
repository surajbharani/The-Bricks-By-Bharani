#!/usr/bin/env python3
"""
Agent Nano Bricks — stdio JSON-lines sidecar.

Protocol:
  stdin:  one JSON line with the run request
  stdout: stream of AgentEvent JSON lines, ending with {"t":"done"} or {"t":"error"}

Request schema:
  {
    "query":     str,
    "mode":      "solo" | "swarm",
    "model":     str,
    "workspace": str,          # absolute path — agent sandbox root
    "token":     str,          # Supabase JWT for proxy auth
    "caps": {
      "max_steps":      int,   # default 20
      "max_concurrency": int,  # default 4 (swarm only)
      "max_inr":        float  # default 5.0 ₹ per run
    }
  }
"""
import json
import sys
import os
from pathlib import Path

# Ensure UTF-8 stdout on all platforms
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
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
    model          = req.get("model", "deepseek/deepseek-chat-v4-flash")
    workspace      = Path(req.get("workspace", str(Path.home() / "Documents" / "Nano Bricks")))
    jwt            = req.get("token", "")
    openrouter_key = req.get("openrouter_key", "")
    caps           = req.get("caps", {})

    if not query:
        _emit_error("Query is empty. Please provide a task.")
        return

    # Determine if we should use OpenRouter directly
    use_openrouter = bool(openrouter_key) and (
        model.startswith("openrouter/") or not jwt or jwt == "dev-token"
    )

    if not use_openrouter and not jwt:
        _emit_error("No auth token provided. Please sign in to Nano Bricks.")
        return

    # Default workspace: Documents/Nano Bricks
    workspace.mkdir(parents=True, exist_ok=True)

    from providers.proxy import make_client, make_openrouter_client, normalize_model
    if use_openrouter:
        client = make_openrouter_client(openrouter_key)
        model = normalize_model(model)
    else:
        client = make_client(jwt)

    if mode == "swarm":
        _run_swarm(query, model, workspace, jwt, client, caps)
    else:
        _run_solo(query, model, workspace, client, caps)


def _run_solo(query, model, workspace, client, caps):
    from agent.loop import run_solo
    try:
        run_solo(query, model, workspace, client, caps)
    except Exception as e:
        _emit_error(f"Solo agent error: {e}")


def _run_swarm(query, model, workspace, jwt, client, caps):
    from swarm.decompose import decompose
    from swarm.scheduler import run_swarm
    from agent.events import emit_thinking, emit_done
    from agent.loop import run_solo

    emit_thinking("Decomposing task into parallel bricks…")

    bricks = decompose(query, model, client)

    if not bricks or len(bricks) == 1:
        # Fall back to Solo
        emit_thinking("Task is sequential — running as a single agent.")
        try:
            run_solo(query, model, workspace, client, caps)
        except Exception as e:
            _emit_error(f"Solo fallback error: {e}")
        return

    emit_thinking(f"Running {len(bricks)} parallel bricks.")
    try:
        result = run_swarm(query, bricks, model, workspace, jwt, caps, client=client)
        if not result.get("ok"):
            _emit_error("Swarm completed with errors. Check brick summaries above.")
    except Exception as e:
        _emit_error(f"Swarm error: {e}")


def _emit_error(message: str) -> None:
    print(json.dumps({"t": "error", "message": message}), flush=True)


if __name__ == "__main__":
    main()
