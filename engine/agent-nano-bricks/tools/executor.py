"""Tool implementations: file I/O + shell execution, sandboxed to workspace."""
import os
import subprocess
from pathlib import Path
from typing import Any


class SandboxViolation(Exception):
    pass


def _safe_path(workspace: Path, rel_or_abs: str) -> Path:
    """Resolve path and verify it stays inside workspace."""
    p = Path(rel_or_abs)
    if not p.is_absolute():
        p = workspace / p
    resolved = p.resolve()
    try:
        resolved.relative_to(workspace.resolve())
    except ValueError:
        raise SandboxViolation(f"Path '{rel_or_abs}' is outside the workspace. Access denied.")
    return resolved


def read_file(workspace: Path, path: str) -> dict[str, Any]:
    try:
        target = _safe_path(workspace, path)
        content = target.read_text(encoding="utf-8", errors="replace")
        return {"ok": True, "content": content[:8000]}  # cap at 8K chars
    except SandboxViolation as e:
        return {"ok": False, "error": str(e)}
    except FileNotFoundError:
        return {"ok": False, "error": f"File not found: {path}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def write_file(workspace: Path, path: str, content: str) -> dict[str, Any]:
    try:
        target = _safe_path(workspace, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        existed = target.exists()
        target.write_text(content, encoding="utf-8")
        return {"ok": True, "action": "edit" if existed else "write", "path": str(target)}
    except SandboxViolation as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def list_dir(workspace: Path, path: str = ".") -> dict[str, Any]:
    try:
        target = _safe_path(workspace, path)
        if not target.is_dir():
            return {"ok": False, "error": f"Not a directory: {path}"}
        entries = []
        for item in sorted(target.iterdir()):
            entries.append({
                "name": item.name,
                "type": "dir" if item.is_dir() else "file",
                "size": item.stat().st_size if item.is_file() else None,
            })
        return {"ok": True, "entries": entries[:100]}
    except SandboxViolation as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def shell_exec(workspace: Path, command: str, timeout: int = 30) -> dict[str, Any]:
    """Run a shell command inside workspace with strict timeout."""
    try:
        # Quick safety check: no ../ escapes in command
        if "../" in command or "..\\" in command:
            return {"ok": False, "error": "Path traversal in command is not allowed."}
        result = subprocess.run(
            command,
            shell=True,
            cwd=str(workspace),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        output = (result.stdout + result.stderr).strip()
        return {
            "ok": result.returncode == 0,
            "returncode": result.returncode,
            "output": output[:4000],
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Command timed out after {timeout}s."}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# Tool schema for the model
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a file in the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path to the file"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write or overwrite a file in the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path to the file"},
                    "content": {"type": "string", "description": "Full file content"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_dir",
            "description": "List files and directories in the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path (default: workspace root)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "shell_exec",
            "description": "Execute a shell command inside the workspace (30s timeout).",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to run"},
                },
                "required": ["command"],
            },
        },
    },
]


def dispatch_tool(workspace: Path, name: str, args: dict) -> dict:
    if name == "read_file":
        return read_file(workspace, args.get("path", ""))
    if name == "write_file":
        return write_file(workspace, args.get("path", ""), args.get("content", ""))
    if name == "list_dir":
        return list_dir(workspace, args.get("path", "."))
    if name == "shell_exec":
        return shell_exec(workspace, args.get("command", ""))
    return {"ok": False, "error": f"Unknown tool: {name}"}
