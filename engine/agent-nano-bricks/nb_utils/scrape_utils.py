"""
Web scraping utilities powered by headless Playwright.

All functions run Playwright in a subprocess (same pattern as browser_action in
the agent executor), so they work safely inside run_python calls.

If Playwright is not installed, every function raises:
    RuntimeError("pip install playwright && playwright install chromium")

Quick start:
    import scrape_utils
    text = scrape_utils.get_page_text("https://example.com")
    rows = scrape_utils.scrape_table("https://example.com/data")
    links = scrape_utils.scrape_links("https://example.com")
"""
import json
import subprocess
import sys

_CHROMIUM_ARGS = '["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]'

# ── Internal subprocess runner ────────────────────────────────────────────────

def _run_pw(script: str, timeout: int = 60) -> dict:
    """Execute a Playwright script in a subprocess and return its JSON output."""
    full = f"""
import sys, json
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print(json.dumps({{"ok": False, "error": "playwright_missing"}}))
    sys.exit(0)

{script}
"""
    proc = subprocess.run(
        [sys.executable, "-c", full],
        capture_output=True, text=True, timeout=timeout,
    )
    out = proc.stdout.strip()
    if not out:
        err = proc.stderr.strip()
        if "playwright_missing" in err or "ModuleNotFoundError" in err:
            raise RuntimeError(
                "Playwright not installed. Run: pip install playwright && playwright install chromium"
            )
        return {"ok": False, "error": err[:1000] or "No output from browser"}
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"ok": True, "output": out[:8000]}


def _browser_script(inner: str) -> str:
    return f"""
with sync_playwright() as _pw:
    _browser = _pw.chromium.launch(headless=True, args={_CHROMIUM_ARGS})
    _ctx = _browser.new_context(viewport={{"width": 1280, "height": 800}})
    _page = _ctx.new_page()
    try:
{inner}
    except Exception as _e:
        print(json.dumps({{"ok": False, "error": str(_e)}}))
    finally:
        _browser.close()
"""


# ── Public scraping functions ─────────────────────────────────────────────────

def get_page_text(url: str, timeout: int = 30) -> str:
    """Navigate to url and return all visible text content."""
    script = _browser_script(f"""
        _page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout={timeout * 1000})
        _page.wait_for_load_state("networkidle", timeout=8000)
        _text = _page.inner_text("body")
        print(json.dumps({{"ok": True, "text": _text[:40000]}}))
    """)
    result = _run_pw(script, timeout + 15)
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "Scrape failed"))
    return result.get("text", "")


def get_page_html(url: str, timeout: int = 30) -> str:
    """Navigate to url and return the full rendered HTML source."""
    script = _browser_script(f"""
        _page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout={timeout * 1000})
        _page.wait_for_load_state("networkidle", timeout=8000)
        _html = _page.content()
        print(json.dumps({{"ok": True, "html": _html[:100000]}}))
    """)
    result = _run_pw(script, timeout + 15)
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "Scrape failed"))
    return result.get("html", "")


def scrape_table(url: str, selector: str = "table", table_index: int = 0,
                 timeout: int = 30) -> list:
    """Scrape an HTML table from url. Returns list of dicts (header row = keys).
    selector targets which element(s) to look inside."""
    script = _browser_script(f"""
        _page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout={timeout * 1000})
        _page.wait_for_load_state("networkidle", timeout=8000)
        _rows = _page.evaluate('''(sel, idx) => {{
            const tables = document.querySelectorAll(sel);
            if (!tables[idx]) return null;
            const rows = [...tables[idx].querySelectorAll("tr")];
            return rows.map(r => [...r.querySelectorAll("th,td")].map(c => c.innerText.trim()));
        }}''', {json.dumps(selector)}, {table_index})
        print(json.dumps({{"ok": True, "rows": _rows}}))
    """)
    result = _run_pw(script, timeout + 15)
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "Table scrape failed"))
    rows = result.get("rows") or []
    if not rows or len(rows) < 2:
        return []
    headers = rows[0]
    return [dict(zip(headers, row)) for row in rows[1:]]


def scrape_links(url: str, selector: str = "a", timeout: int = 30) -> list:
    """Scrape all links from url. Returns list of {text, href} dicts."""
    script = _browser_script(f"""
        _page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout={timeout * 1000})
        _links = _page.evaluate('''(sel) => {{
            return [...document.querySelectorAll(sel)]
                .map(a => ({{text: a.innerText.trim(), href: a.href}}))
                .filter(l => l.href && l.href.startsWith("http"));
        }}''', {json.dumps(selector)})
        print(json.dumps({{"ok": True, "links": _links[:500]}}))
    """)
    result = _run_pw(script, timeout + 15)
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "Link scrape failed"))
    return result.get("links", [])


def scroll_and_scrape(url: str, scroll_times: int = 5, pause_ms: int = 1500,
                      timeout: int = 60) -> str:
    """Scroll the page scroll_times times to trigger lazy loading, then return HTML.
    Useful for infinite-scroll pages (social feeds, product listings, etc.)."""
    script = _browser_script(f"""
        _page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout={timeout * 1000})
        _page.wait_for_load_state("networkidle", timeout=8000)
        for _i in range({scroll_times}):
            _page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            _page.wait_for_timeout({pause_ms})
        _html = _page.content()
        print(json.dumps({{"ok": True, "html": _html[:150000]}}))
    """)
    result = _run_pw(script, timeout + 15)
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "Scroll scrape failed"))
    return result.get("html", "")


def scrape_all_pages(url: str, next_selector: str, max_pages: int = 10,
                     timeout: int = 30) -> list:
    """Paginate through a site by clicking a "Next" button each time.
    Returns list of HTML strings (one per page)."""
    script = _browser_script(f"""
        _page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout={timeout * 1000})
        _pages = []
        for _i in range({max_pages}):
            _page.wait_for_load_state("networkidle", timeout=8000)
            _pages.append(_page.content())
            _next = _page.query_selector({json.dumps(next_selector)})
            if not _next:
                break
            _next.click()
            _page.wait_for_load_state("domcontentloaded", timeout={timeout * 1000})
        print(json.dumps({{"ok": True, "pages": [p[:50000] for p in _pages]}}))
    """)
    result = _run_pw(script, timeout * max_pages + 30)
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "Pagination failed"))
    return result.get("pages", [])


def fill_and_submit(url: str, fields: dict, submit_selector: str,
                    wait_after_ms: int = 2000, timeout: int = 30) -> str:
    """Fill a form and submit it. Returns the HTML of the result page.
    fields = {"input[name='q']": "search term", "#email": "user@example.com"}"""
    fills = json.dumps(fields)
    script = _browser_script(f"""
        _page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout={timeout * 1000})
        _fields = {fills}
        for _sel, _val in _fields.items():
            _page.fill(_sel, str(_val))
        _page.click({json.dumps(submit_selector)})
        _page.wait_for_timeout({wait_after_ms})
        _page.wait_for_load_state("networkidle", timeout=8000)
        print(json.dumps({{"ok": True, "html": _page.content()[:100000],
                           "url": _page.url, "title": _page.title()}}))
    """)
    result = _run_pw(script, timeout + 15)
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "Form submit failed"))
    return result


def screenshot(url: str, save_path: str, full_page: bool = True,
               timeout: int = 30) -> str:
    """Navigate to url and save a screenshot to save_path. Returns save_path."""
    script = _browser_script(f"""
        _page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout={timeout * 1000})
        _page.wait_for_load_state("networkidle", timeout=8000)
        _page.screenshot(path={json.dumps(save_path)}, full_page={str(full_page)})
        print(json.dumps({{"ok": True, "path": {json.dumps(save_path)}}}))
    """)
    result = _run_pw(script, timeout + 15)
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "Screenshot failed"))
    return save_path


def evaluate_js(url: str, js_expression: str, timeout: int = 30):
    """Navigate to url and evaluate a JavaScript expression. Returns the result."""
    script = _browser_script(f"""
        _page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout={timeout * 1000})
        _page.wait_for_load_state("networkidle", timeout=8000)
        _result = _page.evaluate({json.dumps(js_expression)})
        print(json.dumps({{"ok": True, "result": _result}}))
    """)
    result = _run_pw(script, timeout + 15)
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "JS evaluation failed"))
    return result.get("result")


def download_file(url: str, save_path: str, timeout: int = 60) -> str:
    """Click a download link and save the file. Returns save_path.
    url = page containing the download link; trigger_selector = the button/link to click."""
    import urllib.request
    import pathlib
    pathlib.Path(save_path).parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (NanoBricks)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    pathlib.Path(save_path).write_bytes(data)
    return save_path


def scrape_element_text(url: str, selector: str, all_matches: bool = False,
                        timeout: int = 30):
    """Get text from a CSS selector on a rendered page.
    all_matches=False → first match string; True → list of all match strings."""
    script = _browser_script(f"""
        _page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout={timeout * 1000})
        _page.wait_for_load_state("networkidle", timeout=8000)
        if {str(all_matches).lower()} == True:
            _els = _page.query_selector_all({json.dumps(selector)})
            _texts = [e.inner_text() for e in _els]
            print(json.dumps({{"ok": True, "texts": _texts}}))
        else:
            _el = _page.query_selector({json.dumps(selector)})
            _text = _el.inner_text() if _el else ""
            print(json.dumps({{"ok": True, "text": _text}}))
    """)
    result = _run_pw(script, timeout + 15)
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "Element text scrape failed"))
    return result.get("texts") if all_matches else result.get("text", "")
