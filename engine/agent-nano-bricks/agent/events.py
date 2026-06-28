"""AgentEvent emitters — stream structured JSON-lines to stdout."""
import json
import sys
from typing import Literal, Optional


def _emit(event: dict) -> None:
    try:
        print(json.dumps(event, ensure_ascii=False), flush=True)
    except Exception:
        pass  # never crash on emit


def emit_plan(steps: list) -> None:
    _emit({"t": "plan", "steps": steps})


def emit_thinking(text: str) -> None:
    _emit({"t": "thinking", "text": text})


def emit_step(i: int, label: str, status: str) -> None:
    _emit({"t": "step", "i": i, "label": label, "status": status})


def emit_tool_call(name: str, input_summary: str) -> None:
    _emit({"t": "tool_call", "name": name, "inputSummary": input_summary})


def emit_tool_result(name: str, output_summary: str, ok: bool) -> None:
    _emit({"t": "tool_result", "name": name, "outputSummary": output_summary, "ok": ok})


def emit_file(path: str, action: str) -> None:
    _emit({"t": "file", "path": path, "action": action})


def emit_token(text: str) -> None:
    _emit({"t": "token", "text": text})


def emit_subagent(
    agent_id: str,
    brick: str,
    status: str,
    summary: Optional[str] = None,
    name: str = "",
) -> None:
    ev: dict = {"t": "subagent", "id": agent_id, "brick": brick, "status": status}
    if name:
        ev["name"] = name
    if summary is not None:
        ev["summary"] = summary
    _emit(ev)


def emit_spend(tokens: int, inr: float) -> None:
    _emit({"t": "spend", "tokens": tokens, "inr": round(inr, 4)})


def emit_done(ok: bool, summary: str, tokens_used: int) -> None:
    _emit({"t": "done", "ok": ok, "summary": summary, "tokensUsed": tokens_used})


def emit_error(message: str) -> None:
    _emit({"t": "error", "message": message})


def emit_checkpoint(checkpoint_id: str, label: str = "") -> None:
    """A restore point was created — the dashboard can offer a one-click Undo."""
    _emit({"t": "checkpoint", "id": checkpoint_id, "label": label})


def emit_ask(ask_id: str, question: str, kind: str = "question", options: Optional[list] = None) -> None:
    """Pause and ask the user. kind = 'question' | 'approval'."""
    ev: dict = {"t": "ask", "id": ask_id, "question": question, "kind": kind}
    if options:
        ev["options"] = options
    _emit(ev)
