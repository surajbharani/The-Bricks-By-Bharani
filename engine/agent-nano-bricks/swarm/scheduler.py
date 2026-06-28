"""
Swarm Scheduler — runs bricks in parallel using a dependency DAG.
Each brick runs as an isolated Solo agent in its own workspace subfolder.
Uses ThreadPoolExecutor for true parallelism.
"""
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed, Future
from pathlib import Path

from openai import OpenAI

from agent.events import emit_subagent, emit_thinking, emit_error
from agent.loop import run_solo
from providers.proxy import make_client

MAX_CONCURRENCY = 6


def _compress_summary(result: dict) -> str:
    s = result.get("summary", "")
    return s[:400] + "…" if len(s) > 400 else s


def run_swarm(
    query: str,
    bricks: list[dict],
    model: str,
    workspace: Path,
    jwt: str,
    caps: dict,
    client: OpenAI | None = None,
    checkpoint=None,
) -> dict:
    """
    Run bricks in parallel respecting the dependency DAG.
    Returns {ok, summary, tokens_used, inr}.
    No spend ceiling — runs until all bricks complete.
    """
    max_concurrency = caps.get("max_concurrency", MAX_CONCURRENCY)

    # BRICK-01, BRICK-02, ... labels
    brick_names: dict[str, str] = {
        b["id"]: f"BRICK-{str(i + 1).zfill(2)}"
        for i, b in enumerate(bricks)
    }

    completed: dict[str, dict] = {}  # brick_id → result
    lock = threading.Lock()
    total_tokens = 0
    total_inr = 0.0
    all_ok = True

    def brick_ready(brick: dict) -> bool:
        return all(dep in completed for dep in brick.get("needs", []))

    def run_brick(brick: dict) -> None:
        nonlocal total_tokens, total_inr, all_ok

        agent_id = str(uuid.uuid4())[:8]
        agent_name = brick_names.get(brick["id"], f"AGENT-{agent_id[:4].upper()}")
        brick_workspace = workspace / f"brick_{brick['id']}"
        brick_workspace.mkdir(parents=True, exist_ok=True)

        # Pass per-brick caps (no spend ceiling)
        brick_caps = {
            **caps,
            "max_steps": caps.get("max_steps", 60),
        }

        emit_subagent(agent_id, brick["goal"], "spawned", name=agent_name)

        # Enrich query with dependency outputs
        dep_context = ""
        if brick.get("needs"):
            parts = []
            for dep in brick["needs"]:
                dep_result = completed.get(dep, {})
                dep_summary = dep_result.get("summary", "(no output)")
                dep_name = brick_names.get(dep, dep)
                parts.append(f"[{dep_name}] {dep_summary}")
            dep_context = "\n\nContext from completed parallel tasks:\n" + "\n".join(parts)

        enriched_query = brick["goal"] + dep_context

        emit_subagent(agent_id, brick["goal"], "working", name=agent_name)

        brick_client = client if client is not None else make_client(jwt)
        try:
            result = run_solo(
                enriched_query, model, brick_workspace, brick_client,
                brick_caps, emit_identity=False, checkpoint=checkpoint,
            )
        except Exception as e:
            result = {"ok": False, "summary": f"Brick failed: {e}", "tokens_used": 0, "inr": 0.0}

        summary = _compress_summary(result)

        with lock:
            completed[brick["id"]] = {**result, "summary": summary}
            total_tokens += result.get("tokens_used", 0)
            total_inr += result.get("inr", 0.0)
            if not result.get("ok"):
                all_ok = False

        emit_subagent(agent_id, brick["goal"], "done", summary=summary, name=agent_name)

    # ── DAG Scheduler ─────────────────────────────────────────────────────────
    remaining = list(bricks)
    futures: dict[str, Future] = {}

    with ThreadPoolExecutor(max_workers=max_concurrency) as pool:
        # Initial submission: all bricks with no dependencies
        still_waiting = []
        for brick in remaining:
            if brick_ready(brick):
                futures[brick["id"]] = pool.submit(run_brick, brick)
            else:
                still_waiting.append(brick)
        remaining = still_waiting

        while futures:
            # Wait for any one future to complete
            done_futures = {bid: f for bid, f in futures.items() if f.done()}

            if not done_futures:
                # Poll — brief sleep to avoid busy-loop
                import time; time.sleep(0.05)
                continue

            for bid in list(done_futures.keys()):
                futures.pop(bid)
                # Collect exception if any
                try:
                    done_futures[bid].result()
                except Exception as e:
                    with lock:
                        if bid not in completed:
                            completed[bid] = {"ok": False, "summary": f"Exception: {e}"}
                        all_ok = False

                # Re-evaluate which bricks are now unblocked
                newly_ready = []
                still_waiting = []
                for brick in remaining:
                    if brick_ready(brick):
                        newly_ready.append(brick)
                    else:
                        still_waiting.append(brick)
                remaining = still_waiting

                for brick in newly_ready:
                    futures[brick["id"]] = pool.submit(run_brick, brick)

    # Mark any remaining bricks as skipped (dependency failed)
    for brick in remaining:
        if brick["id"] not in completed:
            completed[brick["id"]] = {"ok": False, "summary": "Skipped (dependency failed)."}
            all_ok = False

    # ── Assemble Final Summary ────────────────────────────────────────────────
    parts = [
        f"[{brick_names.get(b['id'], b['id'])}] {b['goal']}: {completed.get(b['id'], {}).get('summary', 'not run')}"
        for b in bricks
    ]
    final_summary = f"Swarm complete — {len(bricks)} bricks.\n" + "\n".join(parts)

    return {
        "ok": all_ok,
        "summary": final_summary[:1200],
        "tokens_used": total_tokens,
        "inr": total_inr,
    }
