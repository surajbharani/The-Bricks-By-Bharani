"""
Agent Nano Bricks — Solo Agent Loop
Plan → Act → Verify → Repeat until done.
High limits: 60 steps, no spend ceiling, full retry logic.
"""
import json
import re
import time
import uuid
from pathlib import Path

from openai import OpenAI

from agent.events import (
    emit_plan, emit_thinking, emit_step, emit_tool_call,
    emit_tool_result, emit_file, emit_token, emit_done, emit_error, emit_spend,
    emit_subagent,
)
from tools.executor import TOOL_DEFINITIONS, dispatch_tool
from providers.proxy import estimate_inr

# ── Limits ────────────────────────────────────────────────────────────────────
MAX_STEPS = 60          # steps before hard stop
MAX_TOOL_RETRIES = 3    # retries per failed tool call
MODEL_RETRIES = 4       # retries on model API error
RETRY_BACKOFF = [1, 2, 4, 8]  # seconds between model retries

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
    # Fallback: split lines
    lines = [l.strip("•-. \t0123456789)") for l in text.splitlines() if l.strip()]
    lines = [l for l in lines if len(l) > 4]
    return lines[:8] or ["Analyze the task", "Execute the solution", "Verify and complete"]


def _summarize_result(result: dict) -> str:
    if not result.get("ok"):
        err = result.get("error", "unknown error")
        return f"Error: {err[:300]}"
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


def _call_model_with_retry(client: OpenAI, model: str, messages: list, tools=None,
                           stream: bool = False, max_tokens: int = 4096) -> any:
    """Call model with automatic retry on transient errors."""
    last_err = None
    for attempt in range(MODEL_RETRIES):
        try:
            kwargs = dict(model=model, messages=messages, max_tokens=max_tokens)
            if tools:
                kwargs["tools"] = tools
                kwargs["tool_choice"] = "auto"
            if stream:
                kwargs["stream"] = True
                kwargs["stream_options"] = {"include_usage": True}
            return client.chat.completions.create(**kwargs)
        except Exception as e:
            last_err = e
            err_str = str(e).lower()
            # Don't retry on auth/quota errors
            if any(x in err_str for x in ("401", "403", "invalid api key", "quota exceeded")):
                raise
            if attempt < MODEL_RETRIES - 1:
                wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
                emit_thinking(f"Model error (attempt {attempt+1}/{MODEL_RETRIES}), retrying in {wait}s…")
                time.sleep(wait)
    raise last_err


def run_solo(
    query: str,
    model: str,
    workspace: Path,
    client: OpenAI,
    caps: dict,
    step_offset: int = 0,
    emit_identity: bool = True,
) -> dict:
    """Run a solo agent loop. Returns {ok, summary, tokens_used, inr}."""
    max_steps = min(caps.get("max_steps", MAX_STEPS), MAX_STEPS)

    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_inr = 0.0

    workspace = workspace.resolve()
    workspace.mkdir(parents=True, exist_ok=True)

    solo_id = str(uuid.uuid4())[:8]
    solo_name = f"AGENT-{solo_id[:4].upper()}"

    if emit_identity:
        emit_subagent(solo_id, query[:80], "spawned", name=solo_name)

    # ── Step 0: Plan ──────────────────────────────────────────────────────────
    try:
        plan_resp = _call_model_with_retry(
            client, model,
            [{"role": "system", "content": _PLAN_PROMPT}, {"role": "user", "content": query}],
            max_tokens=512,
        )
        plan_text = plan_resp.choices[0].message.content or ""
        if plan_resp.usage:
            total_prompt_tokens += plan_resp.usage.prompt_tokens
            total_completion_tokens += plan_resp.usage.completion_tokens
            total_inr += estimate_inr(model, plan_resp.usage.prompt_tokens, plan_resp.usage.completion_tokens)
    except Exception as e:
        emit_error(f"Failed to generate plan: {e}")
        return {"ok": False, "summary": f"Plan failed: {e}", "tokens_used": 0, "inr": 0.0}

    steps = _extract_plan(plan_text)
    emit_plan(steps)

    if emit_identity:
        emit_subagent(solo_id, query[:80], "working", name=solo_name)

    # ── Main Loop ─────────────────────────────────────────────────────────────
    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": query},
    ]

    last_response = ""
    consecutive_no_tool = 0  # track how many times model returns text without tools

    for step_i in range(step_offset, step_offset + max_steps):
        step_idx = step_i - step_offset
        step_label = steps[step_idx] if step_idx < len(steps) else f"Step {step_i + 1}"
        emit_step(step_i, step_label, "run")

        # ── Model Call ────────────────────────────────────────────────────────
        try:
            response = _call_model_with_retry(
                client, model, messages,
                tools=TOOL_DEFINITIONS, stream=True, max_tokens=4096,
            )
        except Exception as e:
            emit_step(step_i, step_label, "fail")
            emit_error(f"Model error at step {step_i + 1}: {e}")
            # Return what we have so far instead of crashing completely
            summary = last_response[:500] if last_response else f"Agent stopped at step {step_i+1}: {e}"
            tokens_used = total_prompt_tokens + total_completion_tokens
            if emit_identity:
                emit_subagent(solo_id, query[:80], "done", summary=summary[:200], name=solo_name)
            emit_done(False, summary, tokens_used)
            return {"ok": False, "summary": summary, "tokens_used": tokens_used, "inr": total_inr}

        # ── Stream Response ───────────────────────────────────────────────────
        content_parts: list[str] = []
        tool_calls_raw: dict[int, dict] = {}
        finish_reason = None

        try:
            for chunk in response:
                choice = chunk.choices[0] if chunk.choices else None
                if choice is None:
                    # Usage-only chunk
                    if hasattr(chunk, "usage") and chunk.usage:
                        total_prompt_tokens += chunk.usage.prompt_tokens or 0
                        total_completion_tokens += chunk.usage.completion_tokens or 0
                        total_inr += estimate_inr(model, chunk.usage.prompt_tokens or 0, chunk.usage.completion_tokens or 0)
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

                if hasattr(chunk, "usage") and chunk.usage:
                    total_prompt_tokens += chunk.usage.prompt_tokens or 0
                    total_completion_tokens += chunk.usage.completion_tokens or 0
                    total_inr += estimate_inr(model, chunk.usage.prompt_tokens or 0, chunk.usage.completion_tokens or 0)
        except Exception as e:
            emit_thinking(f"Stream interrupted at step {step_i + 1}: {e}")
            # Continue with whatever we got

        content = "".join(content_parts)
        last_response = content if content else last_response
        tool_calls_list = [tool_calls_raw[k] for k in sorted(tool_calls_raw.keys())]

        emit_spend(total_prompt_tokens + total_completion_tokens, total_inr)

        # Build assistant message
        asst_msg: dict = {"role": "assistant", "content": content}
        if tool_calls_list:
            asst_msg["tool_calls"] = tool_calls_list
        messages.append(asst_msg)

        if content and not tool_calls_list:
            emit_thinking(content[:400])

        # ── Tool Execution ────────────────────────────────────────────────────
        if tool_calls_list:
            consecutive_no_tool = 0
            for tc in tool_calls_list:
                fn_name = tc["function"]["name"]
                try:
                    fn_args = json.loads(tc["function"]["arguments"] or "{}")
                except json.JSONDecodeError:
                    fn_args = {}

                arg_summary = ", ".join(f"{k}={str(v)[:80]}" for k, v in fn_args.items())
                emit_tool_call(fn_name, arg_summary)

                # Execute with retry on failure
                result = None
                for attempt in range(MAX_TOOL_RETRIES):
                    result = dispatch_tool(workspace, fn_name, fn_args)
                    if result.get("ok"):
                        break
                    if attempt < MAX_TOOL_RETRIES - 1:
                        time.sleep(0.5)

                out_summary = _summarize_result(result)
                emit_tool_result(fn_name, out_summary, result.get("ok", False))

                if fn_name == "write_file" and result.get("ok"):
                    emit_file(result.get("path", fn_args.get("path", "")), result.get("action", "write"))

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })

            emit_step(step_i, step_label, "ok")
            continue

        # ── No tool calls → check if done ─────────────────────────────────────
        emit_step(step_i, step_label, "ok")
        consecutive_no_tool += 1

        content_lower = content.lower()
        is_done = (
            any(sig in content_lower for sig in _DONE_SIGNALS)
            or finish_reason == "stop"
        )

        if is_done:
            break

        # If model keeps responding with text but no tools for 3 turns, force stop
        if consecutive_no_tool >= 3:
            emit_thinking("Task appears complete.")
            break

    # ── Final Summary ─────────────────────────────────────────────────────────
    summary = last_response[:600] if last_response else "Task completed."
    tokens_used = total_prompt_tokens + total_completion_tokens

    if emit_identity:
        emit_subagent(solo_id, query[:80], "done", summary=summary[:200], name=solo_name)
    emit_done(True, summary, tokens_used)

    return {"ok": True, "summary": summary, "tokens_used": tokens_used, "inr": total_inr}
