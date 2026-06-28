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


def _make_ask_fn():
    """Returns a blocking ask(question, kind, options) -> answer:str.
    Emits an 'ask' event then waits for one JSON line on stdin: {"answer": "..."}.
    If stdin closes (no UI attached), returns '' so callers can fall back."""
    import uuid as _uuid
    from agent.events import emit_ask

    def ask(question: str, kind: str = "question", options=None) -> str:
        aid = str(_uuid.uuid4())[:8]
        emit_ask(aid, question, kind, options)
        try:
            line = sys.stdin.readline()
        except Exception:
            return ""
        if not line:
            return ""
        line = line.strip()
        try:
            data = json.loads(line)
            return str(data.get("answer", ""))
        except Exception:
            return line

    return ask


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
    action         = req.get("action", "run")

    # ── Undo: restore the workspace to before the last (or given) run ─────────
    if action == "undo":
        from agent.checkpoint import restore_checkpoint
        workspace.mkdir(parents=True, exist_ok=True)
        res = restore_checkpoint(workspace, req.get("checkpoint", ""))
        if res.get("ok"):
            from agent.events import emit_done
            emit_done(True, f"Undone — restored {res.get('restored',0)} file(s), removed {res.get('removed',0)} new file(s).", 0)
        else:
            _emit_error(res.get("error", "Undo failed."))
        return

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

    # ── Persistent memory + skills (per-user, derived from the auth token) ────
    memory = None
    skills = None
    try:
        from agent.memory import MemoryStore
        from agent.skills import SkillStore
        # Memory lives in a stable folder so it survives across every session.
        mem_base = workspace
        memory = MemoryStore(mem_base, token=jwt or deepseek_key or "local")
        skills = SkillStore(memory)
    except Exception:
        memory = None
        skills = None

    # ── Checkpoint: make this whole run undoable ──────────────────────────────
    checkpoint = None
    try:
        from agent.checkpoint import Checkpointer
        checkpoint = Checkpointer(workspace)
    except Exception:
        checkpoint = None

    # ── Human-in-the-loop: blocking ask() for questions/approvals ─────────────
    # Honors the "Ask me" toggle from the agent screen. When off, ask_fn is None
    # so the agent never pauses to ask — it decides everything itself (Undo is
    # still available as the safety net).
    ask_fn = _make_ask_fn() if caps.get("allow_ask", True) else None

    # ── Dispatch ──────────────────────────────────────────────────────────────
    if mode == "swarm":
        _run_swarm(query, model, workspace, jwt, client, caps, memory, skills, checkpoint, ask_fn)
    else:
        _run_solo(query, model, workspace, client, caps, memory, skills, checkpoint, ask_fn)

    # ── Finalize checkpoint → offer Undo if anything changed ──────────────────
    try:
        if checkpoint is not None and checkpoint.finalize():
            from agent.events import emit_checkpoint
            emit_checkpoint(checkpoint.id, "Undo this task")
    except Exception:
        pass

    # ── Record a session summary so the next session remembers this one ───────
    try:
        if memory is not None:
            memory.record_session_summary(f"Task: {query[:200]}")
            memory.close()
    except Exception:
        pass


def _run_solo(query, model, workspace, client, caps, memory=None, skills=None, checkpoint=None, ask_fn=None):
    from agent.loop import run_solo
    try:
        run_solo(query, model, workspace, client, caps,
                 emit_identity=True, memory=memory, skills=skills,
                 checkpoint=checkpoint, ask_fn=ask_fn)
    except Exception as e:
        _emit_error(f"Agent error: {e}")


def _run_swarm(query, model, workspace, jwt, client, caps, memory=None, skills=None, checkpoint=None, ask_fn=None):
    from swarm.decompose import decompose
    from swarm.scheduler import run_swarm
    from agent.events import emit_thinking

    emit_thinking("Analyzing task for parallel execution…")

    bricks = decompose(query, model, client)

    if not bricks or len(bricks) <= 1:
        emit_thinking("Task is best handled by a single agent.")
        _run_solo(query, model, workspace, client, caps, memory, skills)
        return

    emit_thinking(f"Spawning {len(bricks)} parallel agents…")
    try:
        result = run_swarm(query, bricks, model, workspace, jwt, caps, client=client, checkpoint=checkpoint)
        # Learn from the overall swarm outcome at the top level.
        try:
            if memory is not None and result:
                memory.record_turn(query, result.get("summary", "")[:600], result.get("ok", False))
            if skills is not None and result and result.get("ok"):
                skills.maybe_learn(client, model, query, result.get("summary", "")[:600], True)
        except Exception:
            pass
        if result and not result.get("ok"):
            _emit_error("Swarm completed with one or more failures. See brick summaries above.")
    except Exception as e:
        _emit_error(f"Swarm error: {e}")


if __name__ == "__main__":
    main()
