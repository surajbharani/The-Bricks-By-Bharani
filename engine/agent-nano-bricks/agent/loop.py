"""
Solo agent loop — plan → act → verify → stop.

Architecture derived from Hermes Agent (MIT, © Nous Research).
See NOTICE.md and THIRD_PARTY_LICENSES/ for attribution.
"""
import json
import random
import re
import uuid
from pathlib import Path
from typing import Optional

from openai import OpenAI
from openai.types.chat import ChatCompletionMessage

from agent.events import (
    emit_plan, emit_thinking, emit_step, emit_tool_call,
    emit_tool_result, emit_file, emit_token, emit_done, emit_error, emit_spend,
    emit_subagent,
)
from tools.executor import TOOL_DEFINITIONS, dispatch_tool
from providers.proxy import estimate_inr

_SOLO_NAMES = [
    "Ananya", "Priya", "Kavya", "Divya", "Shreya", "Meera", "Aditi",
    "Siya", "Tanvi", "Riya", "Nandini", "Avni", "Diya", "Vrinda",
    "Saanvi", "Navya", "Aanya", "Ishita", "Kyara", "Aisha",
]

MAX_STEPS = 20
MAX_TOOL_RETRIES = 2

_SYSTEM_PROMPT = open(
    Path(__file__).parent.parent / "prompts" / "system.md"
).read()

_PLAN_SYSTEM = (
    _SYSTEM_PROMPT + "\n\n"
    "FIRST: Output a JSON object with key 'steps' containing an array of "
    "3-7 brief step strings that describe your plan. "
    'Example: {"steps": ["Read the existing file", "Rewrite section 2", "Verify output"]}. '
    "Output ONLY the JSON object, nothing else."
)


def _extract_plan(text: str) -> list[str]:
    """Try to parse the plan JSON from model output."""
    try:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            data = json.loads(m.group())
            steps = data.get("steps", [])
            if isinstance(steps, list) and steps:
                return [str(s) for s in steps[:7]]
    except Exception:
        pass
    # Fallback: split numbered lines
    lines = [l.strip("•-. \t") for l in text.splitlines() if l.strip()]
    return [l for l in lines if l][:7] or ["Execute the task"]


def _summarize_result(result: dict) -> str:
    if not result.get("ok"):
        return f"Error: {result.get('error', 'unknown')}"
    if "content" in result:
        c = result["content"]
        return c[:200] + "…" if len(c) > 200 else c
    if "output" in result:
        o = result["output"]
        return o[:200] + "…" if len(o) > 200 else o
    if "entries" in result:
        names = [e["name"] for e in result["entries"][:10]]
        return f"{len(result['entries'])} entries: {', '.join(names)}"
    return "OK"


def run_solo(
    query: str,
    model: str,
    workspace: Path,
    client: OpenAI,
    caps: dict,
    step_offset: int = 0,
) -> dict:
    """
    Run a solo agent loop. Returns {ok, summary, tokens_used, inr}.
    Streams all AgentEvents to stdout.
    """
    max_steps = caps.get("max_steps", MAX_STEPS)
    max_inr = caps.get("max_inr", 5.0)

    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_inr = 0.0

    workspace = workspace.resolve()
    workspace.mkdir(parents=True, exist_ok=True)

    # Emit solo agent identity with a random Indian female name
    solo_id = str(uuid.uuid4())[:8]
    solo_name = random.choice(_SOLO_NAMES)
    emit_subagent(solo_id, query[:80], "spawned", name=solo_name)

    # ── Step 0: Plan ──────────────────────────────────────────────────────────
    try:
        plan_resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _PLAN_SYSTEM},
                {"role": "user", "content": query},
            ],
            max_tokens=512,
        )
        plan_text = plan_resp.choices[0].message.content or ""
        plan_usage = plan_resp.usage
        if plan_usage:
            total_prompt_tokens += plan_usage.prompt_tokens
            total_completion_tokens += plan_usage.completion_tokens
            total_inr += estimate_inr(model, plan_usage.prompt_tokens, plan_usage.completion_tokens)
    except Exception as e:
        emit_error(f"Failed to generate plan: {e}")
        return {"ok": False, "summary": str(e), "tokens_used": 0, "inr": 0.0}

    steps = _extract_plan(plan_text)
    emit_plan(steps)
    emit_subagent(solo_id, query[:80], "working", name=solo_name)

    # ── Main execution loop ───────────────────────────────────────────────────
    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": query},
    ]

    step_i = step_offset
    last_response = ""

    for step_i in range(step_offset, step_offset + max_steps):
        step_label = steps[step_i - step_offset] if (step_i - step_offset) < len(steps) else f"Step {step_i + 1}"
        emit_step(step_i, step_label, "run")

        # Spend guard
        if total_inr >= max_inr:
            emit_step(step_i, step_label, "fail")
            emit_error(f"Stopped: spend ceiling ₹{max_inr} reached.")
            break

        # Model call
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                tools=TOOL_DEFINITIONS,
                tool_choice="auto",
                max_tokens=2048,
                stream=True,
            )
        except Exception as e:
            emit_step(step_i, step_label, "fail")
            emit_error(f"Model error at step {step_i}: {e}")
            break

        # Stream response
        content_parts: list[str] = []
        tool_calls_raw: list[dict] = {}
        finish_reason = None
        usage_tokens = (0, 0)

        for chunk in response:
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
                            "id": tc.id or "",
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
                usage_tokens = (chunk.usage.prompt_tokens, chunk.usage.completion_tokens)

        content = "".join(content_parts)
        last_response = content

        if usage_tokens[0]:
            total_prompt_tokens += usage_tokens[0]
            total_completion_tokens += usage_tokens[1]
            total_inr += estimate_inr(model, usage_tokens[0], usage_tokens[1])
            emit_spend(total_prompt_tokens + total_completion_tokens, total_inr)

        # Build assistant message for history
        tool_calls_list = [tool_calls_raw[k] for k in sorted(tool_calls_raw.keys())]
        asst_msg: dict = {"role": "assistant", "content": content}
        if tool_calls_list:
            asst_msg["tool_calls"] = tool_calls_list
        messages.append(asst_msg)

        # If thinking text in content, emit it
        if content and not tool_calls_list:
            emit_thinking(content[:300])

        # ── Tool execution ────────────────────────────────────────────────────
        if finish_reason == "tool_calls" or tool_calls_list:
            for tc in tool_calls_list:
                fn_name = tc["function"]["name"]
                try:
                    fn_args = json.loads(tc["function"]["arguments"] or "{}")
                except json.JSONDecodeError:
                    fn_args = {}

                # Summarize input for display
                arg_summary = ", ".join(f"{k}={str(v)[:60]}" for k, v in fn_args.items())
                emit_tool_call(fn_name, arg_summary)

                # Execute with retry
                result = None
                for attempt in range(MAX_TOOL_RETRIES):
                    result = dispatch_tool(workspace, fn_name, fn_args)
                    if result.get("ok"):
                        break

                out_summary = _summarize_result(result)
                emit_tool_result(fn_name, out_summary, result.get("ok", False))

                # File event for write ops
                if fn_name == "write_file" and result.get("ok"):
                    action = result.get("action", "write")
                    emit_file(result.get("path", fn_args.get("path", "")), action)

                # Add tool result to history
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })

            emit_step(step_i, step_label, "ok")
            continue

        # ── No tool calls → model finished ────────────────────────────────────
        emit_step(step_i, step_label, "ok")

        # Check if done
        done_signals = ["task complete", "task is complete", "i have completed",
                        "finished", "done.", "all done", "completed successfully"]
        if any(sig in content.lower() for sig in done_signals) or finish_reason == "stop":
            break

    # ── Summary ───────────────────────────────────────────────────────────────
    summary = last_response[:500] if last_response else "Task completed."
    tokens_used = total_prompt_tokens + total_completion_tokens
    emit_subagent(solo_id, query[:80], "done", summary=summary[:200], name=solo_name)
    emit_done(True, summary, tokens_used)
    return {"ok": True, "summary": summary, "tokens_used": tokens_used, "inr": total_inr}
