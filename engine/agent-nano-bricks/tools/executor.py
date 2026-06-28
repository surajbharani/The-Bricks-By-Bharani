"""
Agent Nano Bricks — Tool Executor
Tools: read_file, write_file, list_dir, shell_exec, web_fetch, browser_action
All tools are sandboxed to the agent workspace.
"""
import json
import os
import subprocess
import time
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
        raise SandboxViolation(f"Path '{rel_or_abs}' is outside the workspace.")
    return resolved


# ── File Tools ────────────────────────────────────────────────────────────────

def read_file(workspace: Path, path: str, offset: int = 0, limit: int = 0) -> dict[str, Any]:
    try:
        target = _safe_path(workspace, path)
        content = target.read_text(encoding="utf-8", errors="replace")
        if offset or limit:
            lines = content.splitlines()
            lines = lines[offset:offset + limit] if limit else lines[offset:]
            content = "\n".join(lines)
        if len(content) > 16000:
            content = content[:16000] + f"\n...[truncated, {len(content)-16000} chars omitted]"
        return {"ok": True, "content": content, "path": str(target)}
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


def append_file(workspace: Path, path: str, content: str) -> dict[str, Any]:
    try:
        target = _safe_path(workspace, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "a", encoding="utf-8") as f:
            f.write(content)
        return {"ok": True, "path": str(target)}
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
            try:
                size = item.stat().st_size if item.is_file() else None
            except Exception:
                size = None
            entries.append({"name": item.name, "type": "dir" if item.is_dir() else "file", "size": size})
        return {"ok": True, "entries": entries[:200]}
    except SandboxViolation as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── Shell Tool ────────────────────────────────────────────────────────────────

def shell_exec(workspace: Path, command: str, timeout: int = 120) -> dict[str, Any]:
    """Execute a shell command inside the workspace."""
    try:
        if "../" in command or "..\\" in command:
            return {"ok": False, "error": "Path traversal in command is not allowed."}
        result = subprocess.run(
            command,
            shell=True,
            cwd=str(workspace),
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        output = (result.stdout + result.stderr).strip()
        if len(output) > 12000:
            output = output[:12000] + f"\n...[truncated, {len(output)-12000} chars omitted]"
        return {
            "ok": result.returncode == 0,
            "returncode": result.returncode,
            "output": output,
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Command timed out after {timeout}s."}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── Web Tool ──────────────────────────────────────────────────────────────────

def web_fetch(workspace: Path, url: str, method: str = "GET",
              headers: dict | None = None, body: str | None = None) -> dict[str, Any]:
    """Fetch a URL. Returns response body capped at 40K chars."""
    try:
        req = urllib.request.Request(url, method=method.upper())
        req.add_header("User-Agent", "Mozilla/5.0 (Agent Nano Bricks/1.0; compatible)")
        req.add_header("Accept", "text/html,application/json,*/*;q=0.9")
        req.add_header("Accept-Language", "en-US,en;q=0.9")
        if headers:
            for k, v in headers.items():
                req.add_header(k, str(v))
        if body:
            req.data = body.encode("utf-8")
            if not headers or "Content-Type" not in headers:
                req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read(81920)  # up to 80K bytes
            charset = "utf-8"
            ct = resp.headers.get("Content-Type", "")
            if "charset=" in ct:
                charset = ct.split("charset=")[-1].split(";")[0].strip()
            try:
                text = raw.decode(charset, errors="replace")
            except (LookupError, UnicodeDecodeError):
                text = raw.decode("utf-8", errors="replace")
            return {
                "ok": True,
                "status": resp.status,
                "url": resp.url,
                "content": text[:40000],
            }
    except urllib.error.HTTPError as e:
        body_bytes = b""
        try:
            body_bytes = e.read(4096)
        except Exception:
            pass
        return {
            "ok": False,
            "error": f"HTTP {e.code}: {e.reason}",
            "body": body_bytes.decode("utf-8", errors="replace"),
        }
    except urllib.error.URLError as e:
        return {"ok": False, "error": f"URL error: {e.reason}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── Browser Tool ──────────────────────────────────────────────────────────────

_BROWSER_SCRIPT = '''
import sys, json
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print(json.dumps({{"ok": False, "error": "Playwright not installed. Run: pip install playwright && playwright install chromium"}}))
    sys.exit(0)

action = {action}
url = {url}
selector = {selector}
value = {value}
script = {script}
save_path = {save_path}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = browser.new_context(viewport={{"width": 1280, "height": 800}})
    page = ctx.new_page()
    result = {{"ok": True}}
    try:
        if action == "navigate":
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_load_state("networkidle", timeout=10000)
            result["title"] = page.title()
            result["url"] = page.url
        elif action == "click":
            page.locator(selector).first.click(timeout=15000)
            result["clicked"] = selector
        elif action == "fill":
            page.locator(selector).first.fill(value, timeout=15000)
            result["filled"] = selector
        elif action == "get_text":
            if selector:
                text = page.locator(selector).first.inner_text(timeout=10000)
            else:
                text = page.inner_text("body")
            result["text"] = text[:10000]
        elif action == "screenshot":
            page.screenshot(path=save_path, full_page=True)
            result["path"] = save_path
        elif action == "evaluate":
            ret = page.evaluate(script)
            result["value"] = str(ret)[:4000]
        elif action == "get_page":
            html = page.content()
            result["html"] = html[:20000]
        else:
            result = {{"ok": False, "error": f"Unknown action: {{action}}"}}
    except Exception as ex:
        result = {{"ok": False, "error": str(ex)}}
    browser.close()
    print(json.dumps(result))
'''


def browser_action(workspace: Path, action: str, url: str = "",
                   selector: str = "", value: str = "",
                   script: str = "", screenshot_path: str = "") -> dict[str, Any]:
    """Control a headless Chromium browser for JS-heavy tasks."""
    try:
        save_path = screenshot_path if screenshot_path else str(workspace / "screenshot.png")
        code = _BROWSER_SCRIPT.format(
            action=json.dumps(action),
            url=json.dumps(url),
            selector=json.dumps(selector),
            value=json.dumps(value),
            script=json.dumps(script),
            save_path=json.dumps(save_path),
        )
        proc = subprocess.run(
            ["python3", "-c", code],
            capture_output=True, text=True, timeout=90,
            cwd=str(workspace),
        )
        out = proc.stdout.strip()
        if out:
            try:
                return json.loads(out)
            except json.JSONDecodeError:
                return {"ok": True, "output": out[:4000]}
        if proc.returncode != 0:
            err = proc.stderr.strip()
            return {"ok": False, "error": err[:2000] if err else "Browser process failed."}
        return {"ok": True, "output": "(no output)"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Browser action timed out after 90s."}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── Tool Schemas ──────────────────────────────────────────────────────────────

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file from the workspace. Returns content up to 16K chars. Use offset/limit for large files.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path relative to workspace"},
                    "offset": {"type": "integer", "description": "Line number to start from (0-indexed, optional)"},
                    "limit": {"type": "integer", "description": "Max lines to return (optional)"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write or overwrite a file in the workspace. Creates parent directories automatically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path relative to workspace"},
                    "content": {"type": "string", "description": "Complete file content to write"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "append_file",
            "description": "Append content to an existing file without overwriting it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path relative to workspace"},
                    "content": {"type": "string", "description": "Content to append"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_dir",
            "description": "List files and folders in a workspace directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Directory path (default: workspace root)"},
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
                "Run a shell command in the workspace (120s timeout, 12K output cap). "
                "Use for: Python/Node scripts, pip install, git, data processing, file transforms, CLI tools."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to execute"},
                    "timeout": {"type": "integer", "description": "Timeout in seconds (default 120, max 300)"},
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
                "Fetch a URL and return the response body (up to 40K chars). "
                "Use for: REST APIs, JSON data, static HTML scraping, file downloads. "
                "For login flows or JS-rendered pages, use browser_action instead."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to fetch"},
                    "method": {
                        "type": "string",
                        "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"],
                        "description": "HTTP method (default: GET)",
                    },
                    "headers": {"type": "object", "description": "HTTP headers as key-value pairs"},
                    "body": {"type": "string", "description": "Request body for POST/PUT"},
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
                "Control a real Chromium browser (headless). "
                "Use for: JavaScript-rendered sites, login flows, form submissions, screenshots, automation. "
                "Requires: pip install playwright && playwright install chromium"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["navigate", "click", "fill", "get_text", "screenshot", "evaluate", "get_page"],
                        "description": "navigate=open URL | click=click element | fill=type into field | get_text=extract text | screenshot=save PNG | evaluate=run JS | get_page=return full HTML",
                    },
                    "url": {"type": "string", "description": "URL to navigate to"},
                    "selector": {"type": "string", "description": "CSS/XPath selector"},
                    "value": {"type": "string", "description": "Text to type (for fill)"},
                    "script": {"type": "string", "description": "JavaScript to run (for evaluate)"},
                    "screenshot_path": {"type": "string", "description": "Where to save screenshot PNG"},
                },
                "required": ["action"],
            },
        },
    },
]


# ── Dispatcher ────────────────────────────────────────────────────────────────

def dispatch_tool(workspace: Path, name: str, args: dict) -> dict:
    try:
        if name == "read_file":
            return read_file(workspace, args["path"], args.get("offset", 0), args.get("limit", 0))
        if name == "write_file":
            return write_file(workspace, args["path"], args.get("content", ""))
        if name == "append_file":
            return append_file(workspace, args["path"], args.get("content", ""))
        if name == "list_dir":
            return list_dir(workspace, args.get("path", "."))
        if name == "shell_exec":
            timeout = min(int(args.get("timeout", 120)), 300)
            return shell_exec(workspace, args["command"], timeout)
        if name == "web_fetch":
            return web_fetch(workspace, args["url"], args.get("method", "GET"),
                             args.get("headers"), args.get("body"))
        if name == "browser_action":
            return browser_action(workspace, args["action"], args.get("url", ""),
                                  args.get("selector", ""), args.get("value", ""),
                                  args.get("script", ""), args.get("screenshot_path", ""))
        return {"ok": False, "error": f"Unknown tool: {name}"}
    except KeyError as e:
        return {"ok": False, "error": f"Missing required argument: {e}"}
    except Exception as e:
        return {"ok": False, "error": f"Tool dispatch error: {e}"}
