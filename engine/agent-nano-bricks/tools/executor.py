"""Tool implementations: file I/O, shell, web fetch, browser — sandboxed to workspace."""
import json
import os
import subprocess
import urllib.request
import urllib.error
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


def shell_exec(workspace: Path, command: str, timeout: int = 60) -> dict[str, Any]:
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
            "output": output[:8000],
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Command timed out after {timeout}s."}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def web_fetch(workspace: Path, url: str, method: str = "GET",
              headers: dict | None = None, body: str | None = None) -> dict[str, Any]:
    """Fetch a URL and return the response body (text, capped at 32K chars).

    Use this to: call REST APIs, fetch web pages, download JSON/text data.
    For JavaScript-heavy sites or login flows, use browser_action instead.
    """
    try:
        req = urllib.request.Request(url, method=method.upper())
        req.add_header("User-Agent", "Mozilla/5.0 (Agent Nano Bricks; compatible)")
        req.add_header("Accept", "text/html,application/json,*/*")
        if headers:
            for k, v in headers.items():
                req.add_header(k, v)
        if body:
            req.data = body.encode("utf-8")
            if "Content-Type" not in (headers or {}):
                req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read(65536)  # read up to 64K bytes
            charset = "utf-8"
            ct = resp.headers.get("Content-Type", "")
            if "charset=" in ct:
                charset = ct.split("charset=")[-1].split(";")[0].strip()
            text = raw.decode(charset, errors="replace")
            return {
                "ok": True,
                "status": resp.status,
                "url": resp.url,
                "content": text[:32000],
            }
    except urllib.error.HTTPError as e:
        body_text = e.read(4096).decode("utf-8", errors="replace") if e.fp else ""
        return {"ok": False, "error": f"HTTP {e.code}: {e.reason}", "body": body_text}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def browser_action(workspace: Path, action: str, url: str = "",
                   selector: str = "", value: str = "",
                   script: str = "", screenshot_path: str = "") -> dict[str, Any]:
    """Control a headless Chromium browser for JavaScript-heavy tasks.

    actions:
      navigate   — open a URL         (requires: url)
      click      — click an element   (requires: selector)
      fill       — type into a field  (requires: selector, value)
      get_text   — extract text       (requires: selector, optional)
      screenshot — save a PNG         (requires: screenshot_path, optional)
      evaluate   — run JavaScript     (requires: script)
      get_page   — return full HTML   (no extra args)

    Runs a single-action Playwright Python script as a subprocess.
    Requires: pip install playwright && playwright install chromium
    Falls back gracefully with an error if Playwright is unavailable.
    """
    try:
        # Build a self-contained Python script for this action
        save_path = screenshot_path if screenshot_path else str(workspace / "screenshot.png")
        script_code = f"""
import sys
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('{{"ok": false, "error": "Playwright not installed. Run: pip install playwright && playwright install chromium"}}')
    sys.exit(0)

import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    result = {{"ok": True}}

    action = {json.dumps(action)}
    url = {json.dumps(url)}
    selector = {json.dumps(selector)}
    value = {json.dumps(value)}
    script = {json.dumps(script)}
    save_path = {json.dumps(save_path)}

    try:
        if action == "navigate":
            page.goto(url, wait_until="networkidle", timeout=30000)
            result["title"] = page.title()
            result["url"] = page.url
        elif action == "click":
            page.locator(selector).first.click(timeout=10000)
            result["clicked"] = selector
        elif action == "fill":
            page.locator(selector).first.fill(value, timeout=10000)
            result["filled"] = selector
        elif action == "get_text":
            if selector:
                text = page.locator(selector).first.inner_text(timeout=10000)
            else:
                text = page.inner_text("body")
            result["text"] = text[:8000]
        elif action == "screenshot":
            page.screenshot(path=save_path, full_page=True)
            result["path"] = save_path
        elif action == "evaluate":
            ret = page.evaluate(script)
            result["value"] = str(ret)[:4000]
        elif action == "get_page":
            html = page.content()
            result["html"] = html[:16000]
        else:
            result = {{"ok": False, "error": f"Unknown action: {{action}}"}}
    except Exception as ex:
        result = {{"ok": False, "error": str(ex)}}

    browser.close()
    print(json.dumps(result))
"""
        proc = subprocess.run(
            ["python", "-c", script_code],
            capture_output=True, text=True, timeout=60,
            cwd=str(workspace),
        )
        out = proc.stdout.strip()
        if out:
            try:
                return json.loads(out)
            except json.JSONDecodeError:
                return {"ok": True, "output": out[:4000]}
        if proc.returncode != 0:
            return {"ok": False, "error": proc.stderr[:2000]}
        return {"ok": True, "output": "(no output)"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Browser action timed out after 60s."}
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
            "description": (
                "Execute a shell command inside the workspace (60s timeout). "
                "Use for: running Python scripts, installing packages (pip install), "
                "data processing, git operations, file transforms, and any CLI tool."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to run"},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_fetch",
            "description": (
                "Fetch a URL and return the response body. "
                "Use for: calling REST APIs, downloading data, scraping static pages, "
                "reading JSON feeds, checking websites. "
                "For login/JavaScript-heavy sites use browser_action instead."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL to fetch"},
                    "method": {"type": "string", "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"], "description": "HTTP method (default GET)"},
                    "headers": {"type": "object", "description": "Optional HTTP headers as key-value pairs"},
                    "body": {"type": "string", "description": "Optional request body (for POST/PUT)"},
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_action",
            "description": (
                "Control a headless Chromium browser for JavaScript-heavy tasks. "
                "Use for: logging into websites, filling forms, clicking buttons, "
                "scraping dynamic content, taking screenshots, automating web workflows. "
                "Requires Playwright: pip install playwright && playwright install chromium."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["navigate", "click", "fill", "get_text", "screenshot", "evaluate", "get_page"],
                        "description": "What to do: navigate=open URL, click=click element, fill=type text, get_text=extract text, screenshot=save PNG, evaluate=run JS, get_page=return HTML",
                    },
                    "url": {"type": "string", "description": "URL to navigate to (for 'navigate')"},
                    "selector": {"type": "string", "description": "CSS selector or XPath for element (for click/fill/get_text)"},
                    "value": {"type": "string", "description": "Text to type (for 'fill')"},
                    "script": {"type": "string", "description": "JavaScript to execute (for 'evaluate')"},
                    "screenshot_path": {"type": "string", "description": "Where to save the screenshot (for 'screenshot', default: screenshot.png in workspace)"},
                },
                "required": ["action"],
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
    if name == "web_fetch":
        return web_fetch(
            workspace, args.get("url", ""),
            args.get("method", "GET"),
            args.get("headers"),
            args.get("body"),
        )
    if name == "browser_action":
        return browser_action(
            workspace,
            args.get("action", ""),
            args.get("url", ""),
            args.get("selector", ""),
            args.get("value", ""),
            args.get("script", ""),
            args.get("screenshot_path", ""),
        )
    return {"ok": False, "error": f"Unknown tool: {name}"}
