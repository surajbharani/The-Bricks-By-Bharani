"""
Swarm scheduler — ready-queue + ThreadPoolExecutor + dependency resolution.
Each brick runs as an isolated Solo agent in its own workspace subfolder.
Architecture derived from Hermes Agent (MIT, © Nous Research).
"""
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, Future
from pathlib import Path
from typing import Optional


from openai import OpenAI

from agent.events import emit_subagent, emit_thinking, emit_error
from agent.loop import run_solo
from providers.proxy import make_client, estimate_inr

MAX_CONCURRENCY = 4


def _compress_summary(result: dict) -> str:
    """Short summary from a brick's run result."""
    s = result.get("summary", "")
    return s[:300] + "…" if len(s) > 300 else s


def run_swarm(
    query: str,
    bricks: list[dict],
    model: str,
    workspace: Path,
    jwt: str,
    caps: dict,
    client: OpenAI | None = None,
) -> dict:
    """
    Run bricks in parallel, respecting dependency DAG.
    Returns {ok, summary, tokens_used, inr}.
    """
    max_concurrency = caps.get("max_concurrency", MAX_CONCURRENCY)
    max_inr = caps.get("max_inr", 10.0)

    brick_names: dict[str, str] = {
        b["id"]: f"BRICK-{str(i+1).zfill(2)}"
        for i, b in enumerate(bricks)
    }

    completed: dict[str, dict] = {}  # brick_id → result
    lock = threading.Lock()
    total_tokens = 0
    total_inr = 0.0
    all_ok = True

    def brick_ready(brick: dict) -> bool:
        return all(dep in completed for dep in brick["needs"])

    def run_brick(brick: dict) -> None:
        nonlocal total_tokens, total_inr, all_ok

        agent_id = str(uuid.uuid4())[:8]
        agent_name = brick_names.get(brick["id"], "Agent")
        brick_workspace = workspace / f"brick_{brick['id']}"
        brick_caps = {**caps, "max_inr": max_inr / len(bricks)}  # split ₹ budget

        emit_subagent(agent_id, brick["goal"], "spawned", name=agent_name)

        # Build enriched query with dependency context
        dep_context = ""
        if brick["needs"]:
            dep_summaries = "\n".join(
                f"- {dep}: {completed.get(dep, {}).get('summary', 'pending')}"
                for dep in brick["needs"]
            )
            dep_context = f"\n\nContext from completed steps:\n{dep_summaries}"

        enriched_query = brick["goal"] + dep_context

        emit_subagent(agent_id, brick["goal"], "working", name=agent_name)

        brick_client = client if client is not None else make_client(jwt)
        result = run_solo(enriched_query, model, brick_workspace, brick_client, brick_caps, emit_identity=False)
        summary = _compress_summary(result)

        with lock:
            completed[brick["id"]] = {**result, "summary": summary}
            total_tokens += result.get("tokens_used", 0)
            total_inr += result.get("inr", 0.0)
            if not result.get("ok"):
                all_ok = False

        emit_subagent(agent_id, brick["goal"], "done", summary=summary, name=agent_name)

    # ── Ready-queue scheduler ─────────────────────────────────────────────────
    remaining = list(bricks)
    futures: dict[str, Future] = {}

    with ThreadPoolExecutor(max_workers=max_concurrency) as pool:
        while remaining or futures:
            # Submit all newly-ready bricks
            still_remaining = []
            for brick in remaining:
                if brick_ready(brick):
                    if total_inr < max_inr:
                        f = pool.submit(run_brick, brick)
                        futures[brick["id"]] = f
                    else:
                        emit_error(f"Brick '{brick['id']}' skipped: spend ceiling reached.")
                        with lock:
                            completed[brick["id"]] = {"ok": False, "summary": "Skipped (spend cap)."}
                else:
                    still_remaining.append(brick)
            remaining = still_remaining

            # Wait for any future to complete
            done_ids = [bid for bid, f in futures.items() if f.done()]
            for bid in done_ids:
                futures.pop(bid)
                # Re-evaluate ready bricks after completion
                newly_ready = []
                still_waiting = []
                for brick in remaining:
                    if brick_ready(brick):
                        newly_ready.append(brick)
                    else:
                        still_waiting.append(brick)
                remaining = still_waiting
                for brick in newly_ready:
                    if total_inr < max_inr:
                        f = pool.submit(run_brick, brick)
                        futures[brick["id"]] = f
                    else:
                        with lock:
                            completed[brick["id"]] = {"ok": False, "summary": "Skipped (spend cap)."}

            if not done_ids and futures:
                # Brief yield to avoid busy-loop
                import time; time.sleep(0.1)

    # ── Assemble summaries ────────────────────────────────────────────────────
    assembled_parts = [
        f"[{b['id']}] {b['goal']}: {completed.get(b['id'], {}).get('summary', 'not run')}"
        for b in bricks
    ]
    final_summary = "Swarm completed.\n" + "\n".join(assembled_parts)

    return {
        "ok": all_ok,
        "summary": final_summary[:800],
        "tokens_used": total_tokens,
        "inr": total_inr,
    }
