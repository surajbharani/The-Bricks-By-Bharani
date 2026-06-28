"""
Agent Nano Bricks — Solo Agent Loop (Hermes-grade)

Plan → Act → Verify → Repeat, with the full Hermes capability set rebuilt in
our own version:
  • Persistent memory      — remembers the user & past tasks across sessions
  • Context compression    — runs indefinitely, never "context length exceeded"
  • Error classification    — knows rate-limit vs auth vs context vs server
  • Model fallback         — auto-switches to a backup model on fatal errors
  • Iteration budget       — step count scales with task complexity
  • Skill memory           — learns reusable skills and gets better over time
"""
import json
import re
import time
import uuid
from pathlib import Path
from typing import Optional

from openai import OpenAI

from agent.events import (
    emit_plan, emit_thinking, emit_step, emit_tool_call,
    emit_tool_result, emit_file, emit_token, emit_done, emit_error, emit_spend,
    emit_subagent,
)
from tools.executor import TOOL_DEFINITIONS, dispatch_tool
from providers.proxy import estimate_inr
from agent.context_compressor import maybe_compress
from agent.error_classifier import classify_api_error, ErrorKind, RETRYABLE, FALLBACKABLE, human_message
from agent.model_fallback import fallback_chain, next_model
from agent.budget import estimate_budget

# ── Limits ────────────────────────────────────────────────────────────────────
MAX_STEPS = 80
MAX_TOOL_RETRIES = 3
MODEL_RETRIES = 4
RETRY_BACKOFF = [1, 2, 4, 8]

_SYSTEM_PROMPT = open(
    Path(__file__).parent.parent / "prompts" / "system.md"
).read()

_PLAN_PROMPT = (
    _SYSTEM_PROMPT + "\n\n"
    "Output a JSON object with key 'steps' — an array of 3-8 short strings describing your plan. "
    'Example: {"steps": ["Read existing files", "Implement the feature", "Test and verify"]}. '
    "Output ONLY valid JSON. No extra text."
)

_DONE_SIGNALS = [
    "task complete", "task is complete", "i have completed", "i've completed",
    "all done", "completed successfully", "work is done", "finished successfully",
    "task finished", "objective complete", "mission complete", "done.",
]


def _extract_plan(text: str) -> list[str]:
    try:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            data = json.loads(m.group())
            steps = data.get("steps", [])
            if isinstance(steps, list) and steps:
                return [str(s) for s in steps[:8]]
    except Exception:
        pass
    lines = [l.strip("•-. \t0123456789)") for l in text.splitlines() if l.strip()]
    lines = [l for l in lines if len(l) > 4]
    return lines[:8] or ["Analyze the task", "Execute the solution", "Verify and complete"]


def _summarize_result(result: dict) -> str:
    if not result.get("ok"):
        return f"Error: {str(result.get('error', 'unknown'))[:300]}"
    for key in ("content", "output", "text", "html", "value"):
        if key in result:
            v = str(result[key])
            return v[:250] + "…" if len(v) > 250 else v
    if "entries" in result:
        names = [e["name"] for e in result["entries"][:12]]
        return f"{len(result['entries'])} items: {', '.join(names)}"
    if "path" in result:
        return f"Saved to {result['path']}"
    return "OK"


def run_solo(
    query: str,
    model: str,
    workspace: Path,
    client: OpenAI,
    caps: dict,
    step_offset: int = 0,
    emit_identity: bool = True,
    memory=None,
    skills=None,
    checkpoint=None,
) -> dict:
    """Run a solo agent loop with the full capability set.
    Returns {ok, summary, tokens_used, inr}."""

    # ── Iteration budget (Hermes: dynamic step budgeting) ─────────────────────
    requested = caps.get("max_steps")
    max_steps = estimate_budget(query, requested)
    max_steps = min(max_steps, MAX_STEPS)

    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_inr = 0.0

    workspace = workspace.resolve()
    workspace.mkdir(parents=True, exist_ok=True)

    solo_id = str(uuid.uuid4())[:8]
    solo_name = f"AGENT-{solo_id[:4].upper()}"

    if emit_identity:
        emit_subagent(solo_id, query[:80], "spawned", name=solo_name)

    # ── Build system prompt with MEMORY + SKILLS (Hermes: cross-session recall)
    system_prompt = _SYSTEM_PROMPT
    try:
        if memory is not None:
            mem_block = memory.build_context_block(query)
            if mem_block:
                system_prompt = mem_block + "\n\n---\n\n" + system_prompt
        if skills is not None:
            skill_block = skills.skills_block(query)
            if skill_block:
                system_prompt = skill_block + "\n\n---\n\n" + system_prompt
    except Exception:
        pass

    # Model fallback chain (Hermes: provider failover)
    chain = fallback_chain(model)
    current_model = model

    # ── Step 0: Plan ──────────────────────────────────────────────────────────
    plan_messages = [
        {"role": "system", "content": (system_prompt + "\n\n" + _PLAN_PROMPT[len(_SYSTEM_PROMPT):])},
        {"role": "user", "content": query},
    ]
    try:
        plan_resp = _safe_create(client, current_model, plan_messages, max_tokens=512)
        plan_text = plan_resp.choices[0].message.content or ""
        if plan_resp.usage:
            total_prompt_tokens += plan_resp.usage.prompt_tokens
            total_completion_tokens += plan_resp.usage.completion_tokens
            total_inr += estimate_inr(current_model, plan_resp.usage.prompt_tokens, plan_resp.usage.completion_tokens)
    except Exception as e:
        emit_error(f"Failed to generate plan: {e}")
        return {"ok": False, "summary": f"Plan failed: {e}", "tokens_used": 0, "inr": 0.0}

    steps = _extract_plan(plan_text)
    emit_plan(steps)

    if emit_identity:
        emit_subagent(solo_id, query[:80], "working", name=solo_name)

    # ── Main Loop ─────────────────────────────────────────────────────────────
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": query},
    ]

    last_response = ""
    consecutive_no_tool = 0
    verify_rounds = 0
    did_work = False  # only self-review runs that actually used tools
    MAX_VERIFY = 2

    # Goal pinning — re-inject the original task so it never drifts out of
    # attention on long runs ("lost in the middle").
    PIN_EVERY = 8
    # Stuck detection — if the same tool call repeats and keeps failing, the
    # agent is looping; force a strategy change instead of spinning.
    recent_sigs: list[str] = []

    for step_i in range(step_offset, step_offset + max_steps):
        step_idx = step_i - step_offset
        step_label = steps[step_idx] if step_idx < len(steps) else f"Step {step_i + 1}"
        emit_step(step_i, step_label, "run")

        # ── Goal pinning — keep the original task in attention on long runs ────
        if step_idx > 0 and step_idx % PIN_EVERY == 0:
            messages.append({
                "role": "user",
                "content": (
                    "REMINDER — stay on the original task and its constraints:\n"
                    f"{query}\n"
                    "Do not drift. Finish exactly what was asked."
                ),
            })

        # ── Proactive context compression (Hermes: never overflow) ────────────
        try:
            messages, did = maybe_compress(messages, client, current_model)
            if did:
                emit_thinking("Compressed earlier history to keep working without limits.")
        except Exception:
            pass

        # ── Model call with classify → retry / compress / fallback ────────────
        response = None
        attempts = 0
        while response is None:
            try:
                response = client.chat.completions.create(
                    model=current_model,
                    messages=messages,
                    tools=TOOL_DEFINITIONS,
                    tool_choice="auto",
                    max_tokens=4096,
                    stream=True,
                    stream_options={"include_usage": True},
                )
            except Exception as e:
                attempts += 1
                kind = classify_api_error(e)

                if kind in (ErrorKind.AUTH, ErrorKind.QUOTA):
                    emit_step(step_i, step_label, "fail")
                    emit_error(human_message(kind))
                    return _finalize(False, last_response or human_message(kind),
                                     total_prompt_tokens + total_completion_tokens, total_inr,
                                     emit_identity, solo_id, solo_name, query)

                if kind == ErrorKind.CONTEXT_LENGTH:
                    emit_thinking("Context full — compressing history and retrying.")
                    messages, did = maybe_compress(messages, client, current_model, force=True)
                    if attempts <= MODEL_RETRIES:
                        continue

                if kind in FALLBACKABLE or attempts > MODEL_RETRIES:
                    nm = next_model(current_model, chain)
                    if nm:
                        emit_thinking(f"Switching to fallback model: {nm.split('/')[-1]}")
                        current_model = nm
                        continue

                if kind in RETRYABLE and attempts <= MODEL_RETRIES:
                    wait = RETRY_BACKOFF[min(attempts - 1, len(RETRY_BACKOFF) - 1)]
                    emit_thinking(f"{human_message(kind)} (retry {attempts}/{MODEL_RETRIES} in {wait}s)")
                    time.sleep(wait)
                    continue

                # Out of options
                emit_step(step_i, step_label, "fail")
                emit_error(f"Model error: {e}")
                return _finalize(False, last_response or str(e),
                                 total_prompt_tokens + total_completion_tokens, total_inr,
                                 emit_identity, solo_id, solo_name, query)

        # ── Stream the response ───────────────────────────────────────────────
        content_parts: list[str] = []
        tool_calls_raw: dict[int, dict] = {}
        finish_reason = None

        try:
            for chunk in response:
                if hasattr(chunk, "usage") and chunk.usage:
                    total_prompt_tokens += chunk.usage.prompt_tokens or 0
                    total_completion_tokens += chunk.usage.completion_tokens or 0
                    total_inr += estimate_inr(current_model, chunk.usage.prompt_tokens or 0, chunk.usage.completion_tokens or 0)

                choice = chunk.choices[0] if chunk.choices else None
                if choice is None:
                    continue
                delta = choice.delta
                finish_reason = choice.finish_reason or finish_reason

                if delta.content:
                    emit_token(delta.content)
                    content_parts.append(delta.content)

                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_raw:
                            tool_calls_raw[idx] = {
                                "id": tc.id or f"call_{idx}",
                                "type": "function",
                                "function": {"name": tc.function.name or "", "arguments": ""},
                            }
                        if tc.function.arguments:
                            tool_calls_raw[idx]["function"]["arguments"] += tc.function.arguments
                        if tc.id:
                            tool_calls_raw[idx]["id"] = tc.id
                        if tc.function.name:
                            tool_calls_raw[idx]["function"]["name"] = tc.function.name
        except Exception as e:
            emit_thinking(f"Stream interrupted: {e}")

        content = "".join(content_parts)
        last_response = content if content else last_response
        tool_calls_list = [tool_calls_raw[k] for k in sorted(tool_calls_raw.keys())]

        emit_spend(total_prompt_tokens + total_completion_tokens, total_inr)

        asst_msg: dict = {"role": "assistant", "content": content}
        if tool_calls_list:
            asst_msg["tool_calls"] = tool_calls_list
        messages.append(asst_msg)

        if content and not tool_calls_list:
            emit_thinking(content[:400])

        # ── Tool execution ────────────────────────────────────────────────────
        if tool_calls_list:
            consecutive_no_tool = 0
            did_work = True
            for tc in tool_calls_list:
                fn_name = tc["function"]["name"]
                try:
                    fn_args = json.loads(tc["function"]["arguments"] or "{}")
                except json.JSONDecodeError:
                    fn_args = {}

                arg_summary = ", ".join(f"{k}={str(v)[:80]}" for k, v in fn_args.items())
                emit_tool_call(fn_name, arg_summary)

                tool_context = {
                    "client": client, "model": current_model, "caps": caps,
                    "depth": caps.get("_subagent_depth", 0),
                    "checkpoint": checkpoint,
                }
                result = None
                for attempt in range(MAX_TOOL_RETRIES):
                    result = dispatch_tool(workspace, fn_name, fn_args, tool_context)
                    if result.get("ok"):
                        break
                    if attempt < MAX_TOOL_RETRIES - 1:
                        time.sleep(0.5)

                emit_tool_result(fn_name, _summarize_result(result), result.get("ok", False))

                if fn_name in ("write_file", "edit_file", "multi_edit") and result.get("ok"):
                    emit_file(result.get("path", fn_args.get("path", "")), result.get("action", "edit"))

                # ── Stuck/loop detection — same failing call over and over ──────
                sig = f"{fn_name}:{tc['function']['arguments']}"
                if not result.get("ok"):
                    recent_sigs.append(sig)
                    if recent_sigs.count(sig) >= 3:
                        emit_thinking("Detected a repeating failed action — changing strategy.")
                        result = dict(result)
                        result["_loop_warning"] = (
                            "You have tried this exact action 3 times and it keeps failing. "
                            "STOP repeating it. Try a fundamentally different approach, or if it is "
                            "truly impossible, say so clearly instead of retrying."
                        )
                        recent_sigs.clear()
                else:
                    recent_sigs.clear()

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })

            emit_step(step_i, step_label, "ok")
            continue

        # ── No tools → done check + SELF-VERIFICATION ─────────────────────────
        emit_step(step_i, step_label, "ok")
        consecutive_no_tool += 1

        content_lower = content.lower()
        wants_finish = (
            any(sig in content_lower for sig in _DONE_SIGNALS)
            or finish_reason == "stop"
            or consecutive_no_tool >= 3
        )
        if wants_finish:
            # Skip the review call for pure-chat answers (no tools used) — there
            # are no files/actions to verify, so it would just waste a round-trip.
            if not did_work or verify_rounds >= MAX_VERIFY:
                break
            # Review own work against the goal before declaring done.
            emit_thinking("Reviewing my work against the goal…")
            verdict = _verify_work(client, current_model, query, last_response, workspace)
            verify_rounds += 1
            if verdict.get("complete", True):
                emit_thinking("Review passed — task is complete.")
                break
            # Gaps found — feed them back and keep working.
            missing = verdict.get("missing", "").strip()
            emit_thinking(f"Review found gaps — fixing: {missing[:160]}")
            messages.append({
                "role": "user",
                "content": (
                    "A self-review found the task is NOT fully complete yet. "
                    "Specifically still missing or incorrect:\n"
                    f"{missing}\n\n"
                    "Fix these issues completely using your tools, then finish."
                ),
            })
            consecutive_no_tool = 0
            continue

    # ── Final summary + LEARN (Hermes: closed learning loop) ──────────────────
    summary = last_response[:600] if last_response else "Task completed."
    tokens_used = total_prompt_tokens + total_completion_tokens

    # Emit 'done' FIRST so the dashboard shows completion immediately, then do
    # the post-turn learning (memory write + skill distillation) in the
    # background before the process exits. Learning must never delay the UI.
    result = _finalize(True, summary, tokens_used, total_inr,
                       emit_identity, solo_id, solo_name, query)
    try:
        if memory is not None:
            memory.record_turn(query, summary, True)
            from agent.memory import extract_facts
            for fact in extract_facts(query):
                memory.remember_fact(fact)
        if skills is not None:
            skills.maybe_learn(client, current_model, query, summary, True)
    except Exception:
        pass

    return result


def _verify_work(client: OpenAI, model: str, query: str, last_response: str, workspace: Path) -> dict:
    """Self-review: did the agent actually complete the task? Grounded in the
    real files now in the workspace. Fail-open — a review error never blocks the
    user from finishing."""
    try:
        files = []
        for p in workspace.rglob("*"):
            if p.is_file() and ".nanobricks_memory" not in p.parts:
                files.append(str(p.relative_to(workspace)))
            if len(files) >= 60:
                break
    except Exception:
        files = []

    prompt = (
        "Review whether this task was GENUINELY and FULLY completed.\n\n"
        f"TASK:\n{query}\n\n"
        f"AGENT'S FINAL RESPONSE:\n{last_response[:1500]}\n\n"
        f"FILES NOW IN WORKSPACE:\n{', '.join(files) if files else '(none)'}\n\n"
        "Be strict. Do NOT accept a claim of success without evidence — check the "
        "files actually exist and contain what the task required. Agents often falsely "
        "claim completion to end the loop; catch that. If the task is genuinely and "
        "fully done with real evidence, output exactly {\"complete\": true}. If anything "
        "is missing, wrong, unproven, or only claimed-but-not-done, output "
        "{\"complete\": false, \"missing\": \"<specific, actionable gaps>\"}. Output ONLY JSON."
    )
    try:
        resp = _safe_create(
            client, model,
            [
                {"role": "system", "content": "You are a strict completion reviewer. Output only JSON."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=300,
        )
        text = resp.choices[0].message.content or ""
        text = re.sub(r"```(?:json)?", "", text).strip()
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            data = json.loads(m.group())
            return {"complete": bool(data.get("complete", True)), "missing": str(data.get("missing", ""))}
    except Exception:
        pass
    return {"complete": True}


def _safe_create(client: OpenAI, model: str, messages: list, max_tokens: int):
    """Non-streaming create with simple retry — used for planning."""
    last = None
    for attempt in range(MODEL_RETRIES):
        try:
            return client.chat.completions.create(model=model, messages=messages, max_tokens=max_tokens)
        except Exception as e:
            last = e
            kind = classify_api_error(e)
            if kind in (ErrorKind.AUTH, ErrorKind.QUOTA):
                raise
            if attempt < MODEL_RETRIES - 1:
                time.sleep(RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)])
    raise last


def _finalize(ok: bool, summary: str, tokens_used: int, inr: float,
              emit_identity: bool, solo_id: str, solo_name: str, query: str) -> dict:
    if emit_identity:
        emit_subagent(solo_id, query[:80], "done", summary=summary[:200], name=solo_name)
    emit_done(ok, summary, tokens_used)
    return {"ok": ok, "summary": summary, "tokens_used": tokens_used, "inr": inr}
