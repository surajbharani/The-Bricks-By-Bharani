"""
Universal Web Scraping Utilities — extract EVERYTHING from any website.

Covers: text, images, videos, PDFs, files, tables, forms, metadata,
        JSON-LD structured data, sitemaps, RSS/Atom feeds, internal links,
        emails, phone numbers, social handles, open graph tags, schema.org,
        cookies, localStorage, page screenshots, full-page PDF export,
        deep crawls, and parallel multi-URL scraping.

All Playwright calls run in a subprocess (stealth mode, same pattern as
scrape_utils / social_scrape_utils).

Quick start:
    import web_scrape_utils as ws

    everything = ws.scrape_page("https://example.com")
    images     = ws.download_all_images("https://example.com", save_dir="imgs/")
    links      = ws.crawl_site("https://example.com", max_pages=50)
    feeds      = ws.parse_rss("https://example.com/feed.xml")
    emails     = ws.extract_contacts("https://example.com")
"""
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

# ── Stealth browser config ────────────────────────────────────────────────────
_ARGS = json.dumps([
    "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars", "--window-size=1440,900",
    "--disable-extensions", "--no-first-run",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-ipc-flooding-protection",
])
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
_STEALTH_JS = """
    Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
    Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});
    Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});
    window.chrome={runtime:{}};
    Object.defineProperty(navigator,'permissions',{get:()=>({query:()=>Promise.resolve({state:'granted'})})});
"""

# ── Core subprocess runner ────────────────────────────────────────────────────

def _run(script: str, timeout: int = 120) -> dict:
    full = f"""
import sys, json, os, re, urllib.parse
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print(json.dumps({{"ok": False, "error": "playwright_missing"}}))
    sys.exit(0)

STEALTH = {json.dumps(_STEALTH_JS)}

def new_page(pw, extra_headers=None):
    browser = pw.chromium.launch(headless=True, args={_ARGS})
    ctx = browser.new_context(
        user_agent={json.dumps(_UA)},
        viewport={{"width": 1440, "height": 900}},
        locale="en-US",
        timezone_id="America/New_York",
        accept_downloads=True,
        extra_http_headers={{
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            **(extra_headers or {{}}),
        }},
    )
    ctx.add_init_script(STEALTH)
    page = ctx.new_page()
    page.set_default_timeout(30000)
    return browser, ctx, page

def wait_full(page, timeout=8000):
    try:
        page.wait_for_load_state("networkidle", timeout=timeout)
    except Exception:
        pass

def scroll_all(page, times=5, pause=1200):
    for _ in range(times):
        page.evaluate("window.scrollTo(0,document.body.scrollHeight)")
        page.wait_for_timeout(pause)

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
            raise RuntimeError("Playwright not installed. Run: pip install playwright && playwright install chromium")
        return {"ok": False, "error": err[:3000] or "No output"}
    try:
        return json.loads(out.split("\n")[-1])
    except json.JSONDecodeError:
        return {"ok": True, "raw": out[:10000]}


# ══════════════════════════════════════════════════════════════════════════════
# FULL PAGE SCRAPE — text + images + links + metadata + structured data
# ══════════════════════════════════════════════════════════════════════════════

def scrape_page(url: str, scroll: bool = True, timeout: int = 60) -> dict:
    """Scrape EVERYTHING from a page in one call.

    Returns dict with keys:
        url, title, description, keywords, text, headings,
        images, videos, links, internal_links, external_links,
        emails, phones, tables, forms, open_graph, twitter_card,
        json_ld, meta_tags, canonical, lang, word_count
    """
    scroll_code = "scroll_all(page)" if scroll else ""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        {scroll_code}
        base = page.url
        data = page.evaluate('''(base) => {{
            const abs = href => {{
                try {{ return new URL(href, base).href; }} catch {{ return href; }}
            }};
            // Basic meta
            const title = document.title || "";
            const desc  = document.querySelector('meta[name="description"]')?.content || "";
            const kw    = document.querySelector('meta[name="keywords"]')?.content || "";
            const lang  = document.documentElement.lang || "";
            const canon = document.querySelector('link[rel="canonical"]')?.href || "";

            // Text
            const body_text = document.body?.innerText?.trim() || "";

            // Headings
            const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(h => ({{
                level: parseInt(h.tagName[1]), text: h.innerText.trim()
            }}));

            // Images
            const images = [...document.querySelectorAll("img, [data-src], [data-lazy-src]")].map(i => ({{
                src:   abs(i.src || i.dataset.src || i.dataset.lazySrc || ""),
                alt:   i.alt || "",
                title: i.title || "",
                width: i.naturalWidth || i.width || 0,
                height:i.naturalHeight|| i.height || 0,
            }})).filter(i => i.src && !i.src.startsWith("data:") && i.src.startsWith("http"));

            // Videos
            const videos = [...document.querySelectorAll("video, iframe[src*='youtube'], iframe[src*='vimeo'], iframe[src*='dailymotion']")].map(v => ({{
                src:    abs(v.src || v.currentSrc || ""),
                poster: v.poster || "",
                type:   v.tagName.toLowerCase(),
                width:  v.width || 0, height: v.height || 0,
            }})).filter(v => v.src);

            // Links
            const all_links = [...document.querySelectorAll("a[href]")].map(a => ({{
                text: a.innerText.trim(),
                href: abs(a.href),
                title: a.title || "",
                rel: a.rel || "",
            }})).filter(l => l.href.startsWith("http"));

            const base_origin = new URL(base).origin;
            const internal = all_links.filter(l => l.href.startsWith(base_origin));
            const external = all_links.filter(l => !l.href.startsWith(base_origin));

            // File links (PDF, DOCX, XLSX, ZIP, etc.)
            const file_exts = /\\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|tar|gz|csv|json|xml|mp3|mp4|mov|avi|mkv)$/i;
            const files = all_links.filter(l => file_exts.test(l.href.split("?")[0]));

            // Emails & phones
            const page_text = document.body?.innerHTML || "";
            const emails = [...new Set((page_text.match(/[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{{2,}}/g)||[]))];
            const phones = [...new Set((document.body?.innerText?.match(/(\\+?\\d[\\s\\-.]?){{7,15}}/g)||[]).map(p=>p.trim()))];

            // Tables
            const tables = [...document.querySelectorAll("table")].map(t => {{
                const rows = [...t.querySelectorAll("tr")].map(r =>
                    [...r.querySelectorAll("th,td")].map(c => c.innerText.trim())
                );
                return rows;
            }});

            // Forms
            const forms = [...document.querySelectorAll("form")].map(f => ({{
                action: abs(f.action || ""),
                method: f.method || "get",
                fields: [...f.querySelectorAll("input,select,textarea")].map(el => ({{
                    name: el.name || el.id || "",
                    type: el.type || el.tagName.toLowerCase(),
                    placeholder: el.placeholder || "",
                    required: el.required || false,
                }})),
            }}));

            // Open Graph
            const og = {{}};
            document.querySelectorAll('meta[property^="og:"]').forEach(m => {{
                og[m.getAttribute("property").replace("og:","")] = m.content;
            }});

            // Twitter Card
            const tw = {{}};
            document.querySelectorAll('meta[name^="twitter:"]').forEach(m => {{
                tw[m.getAttribute("name").replace("twitter:","")] = m.content;
            }});

            // All meta tags
            const meta_tags = {{}};
            document.querySelectorAll("meta[name],meta[property],meta[http-equiv]").forEach(m => {{
                const k = m.name || m.getAttribute("property") || m.httpEquiv;
                if (k) meta_tags[k] = m.content || m.getAttribute("content") || "";
            }});

            // JSON-LD structured data
            const json_ld = [];
            document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {{
                try {{ json_ld.push(JSON.parse(s.textContent)); }} catch {{}}
            }});

            // Social links
            const social_patterns = {{
                twitter: /twitter\\.com|x\\.com\\/(?!i\\/)/,
                facebook: /facebook\\.com/,
                instagram: /instagram\\.com/,
                linkedin: /linkedin\\.com/,
                youtube: /youtube\\.com|youtu\\.be/,
                tiktok: /tiktok\\.com/,
                github: /github\\.com/,
            }};
            const socials = {{}};
            all_links.forEach(l => {{
                for (const [k,p] of Object.entries(social_patterns)) {{
                    if (p.test(l.href) && !socials[k]) socials[k] = l.href;
                }}
            }});

            return {{
                title, description: desc, keywords: kw, lang, canonical: canon,
                text: body_text.slice(0, 50000),
                word_count: body_text.split(/\\s+/).filter(Boolean).length,
                headings,
                images: images.slice(0, 200),
                videos,
                links: all_links.slice(0, 500),
                internal_links: internal.slice(0, 300),
                external_links: external.slice(0, 200),
                file_links: files,
                emails, phones,
                tables,
                forms,
                open_graph: og,
                twitter_card: tw,
                meta_tags,
                json_ld,
                social_links: socials,
            }};
        }}''', base)
        data["url"] = base
        print(json.dumps({{"ok": True, "data": data}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Page scrape failed"))
    return r.get("data", {})


# ══════════════════════════════════════════════════════════════════════════════
# IMAGE SCRAPING & DOWNLOADING
# ══════════════════════════════════════════════════════════════════════════════

def scrape_images(url: str, min_width: int = 50, min_height: int = 50,
                  timeout: int = 60) -> list:
    """Get all images from a page (filtered by minimum size).
    Returns list of {src, alt, width, height, title}."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        scroll_all(page)
        images = page.evaluate('''() => {{
            return [...document.querySelectorAll("img, [data-src], source")].map(i => ({{
                src:    i.src || i.dataset.src || i.dataset.lazySrc || i.srcset?.split(" ")[0] || "",
                alt:    i.alt || "",
                title:  i.title || "",
                width:  i.naturalWidth || i.width || 0,
                height: i.naturalHeight || i.height || 0,
            }})).filter(i => i.src && i.src.startsWith("http")
                           && i.width >= {min_width} && i.height >= {min_height});
        }}''')
        # Also pick up CSS background images
        bg = page.evaluate('''() => {{
            const imgs = [];
            [...document.querySelectorAll("*")].forEach(el => {{
                const bg = window.getComputedStyle(el).backgroundImage;
                const m = bg?.match(/url\\(["']?([^"')]+)["']?\\)/);
                if (m && m[1].startsWith("http")) imgs.push({{src: m[1], alt:"", title:"", width:0, height:0}});
            }});
            return imgs.slice(0, 100);
        }}''')
        all_imgs = images + bg
        # Deduplicate
        seen = set()
        deduped = []
        for i in all_imgs:
            if i["src"] not in seen:
                seen.add(i["src"])
                deduped.append(i)
        print(json.dumps({{"ok": True, "images": deduped}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Image scrape failed"))
    return r.get("images", [])


def download_all_images(url: str, save_dir: str, min_width: int = 100,
                        min_height: int = 100, timeout: int = 90) -> list:
    """Download all images from a page to save_dir.
    Returns list of saved file paths."""
    images = scrape_images(url, min_width=min_width, min_height=min_height, timeout=timeout)
    save_path = Path(save_dir)
    save_path.mkdir(parents=True, exist_ok=True)
    saved = []
    headers = {"User-Agent": _UA, "Referer": url}
    for img in images:
        src = img["src"]
        try:
            parsed = urllib.parse.urlparse(src)
            ext = Path(parsed.path).suffix or ".jpg"
            fname = re.sub(r"[^\w\-.]", "_", Path(parsed.path).name) or f"img_{len(saved)}{ext}"
            dest = save_path / fname
            req = urllib.request.Request(src, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                dest.write_bytes(resp.read())
            saved.append(str(dest))
        except Exception:
            continue
    return saved


def download_file(url: str, save_path: str, referer: str = "") -> str:
    """Download any file from a URL. Returns save_path."""
    Path(save_path).parent.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": _UA}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        Path(save_path).write_bytes(r.read())
    return save_path


def download_all_files(url: str, save_dir: str,
                       extensions: list = None, timeout: int = 60) -> list:
    """Download all linked files (PDFs, ZIPs, etc.) from a page.
    extensions = ['.pdf', '.zip', ...] — defaults to common document/media types."""
    if extensions is None:
        extensions = [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
                      ".zip", ".rar", ".7z", ".tar", ".gz", ".csv", ".mp3", ".mp4",
                      ".mov", ".avi", ".mkv", ".json", ".xml", ".epub"]
    data = scrape_page(url, scroll=False, timeout=timeout)
    file_links = data.get("file_links", [])
    save_path = Path(save_dir)
    save_path.mkdir(parents=True, exist_ok=True)
    saved = []
    for link in file_links:
        href = link.get("href", "")
        ext = Path(urllib.parse.urlparse(href).path).suffix.lower()
        if ext not in extensions:
            continue
        try:
            fname = Path(urllib.parse.urlparse(href).path).name or f"file_{len(saved)}{ext}"
            dest = str(save_path / re.sub(r"[^\w\-.]", "_", fname))
            download_file(href, dest, referer=url)
            saved.append({"url": href, "path": dest})
        except Exception:
            continue
    return saved


# ══════════════════════════════════════════════════════════════════════════════
# SCREENSHOT & PDF EXPORT
# ══════════════════════════════════════════════════════════════════════════════

def screenshot_page(url: str, save_path: str, full_page: bool = True,
                    timeout: int = 45) -> str:
    """Screenshot a full page (or viewport). Returns save_path."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        page.screenshot(path={json.dumps(save_path)}, full_page={str(full_page)}, type="png")
        print(json.dumps({{"ok": True, "path": {json.dumps(save_path)}}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Screenshot failed"))
    return save_path


def export_pdf(url: str, save_path: str, timeout: int = 45) -> str:
    """Export a page as PDF. Returns save_path."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        page.pdf(path={json.dumps(save_path)}, format="A4", print_background=True)
        print(json.dumps({{"ok": True, "path": {json.dumps(save_path)}}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "PDF export failed"))
    return save_path


def screenshot_element(url: str, selector: str, save_path: str, timeout: int = 30) -> str:
    """Screenshot a specific element on the page. Returns save_path."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        el = page.query_selector({json.dumps(selector)})
        if el:
            el.screenshot(path={json.dumps(save_path)})
            print(json.dumps({{"ok": True, "path": {json.dumps(save_path)}}}))
        else:
            print(json.dumps({{"ok": False, "error": "Element not found: {selector}"}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Element screenshot failed"))
    return save_path


# ══════════════════════════════════════════════════════════════════════════════
# CONTACT & PII EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def extract_contacts(url: str, timeout: int = 60) -> dict:
    """Extract all contact info from a page.
    Returns {emails, phones, addresses, social_links, whatsapp, skype}."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        scroll_all(page, times=3, pause=1000)
        data = page.evaluate('''() => {{
            const html = document.body.innerHTML || "";
            const text = document.body.innerText || "";

            const emails = [...new Set((html.match(/[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{{2,12}}/g)||[])
                .filter(e => !e.endsWith(".png") && !e.endsWith(".jpg")))];

            const phones = [...new Set((text.match(/(\\+?\\d[\\s.\\-]?){{7,15}}/g)||[]).map(p=>p.trim()).filter(p=>p.length>=7))];

            const mailto_links = [...document.querySelectorAll("a[href^='mailto:']")].map(a => a.href.replace("mailto:","").split("?")[0]);
            const tel_links    = [...document.querySelectorAll("a[href^='tel:']")].map(a => a.href.replace("tel:",""));
            const wa_links     = [...document.querySelectorAll("a[href*='wa.me'], a[href*='whatsapp.com/send']")].map(a => a.href);
            const skype_links  = [...document.querySelectorAll("a[href^='skype:']")].map(a => a.href);

            const social = {{}};
            const patterns = {{
                twitter:   /(?:twitter|x)\\.com\\/([\\w]+)/,
                facebook:  /facebook\\.com\\/([\\w.]+)/,
                instagram: /instagram\\.com\\/([\\w.]+)/,
                linkedin:  /linkedin\\.com\\/(?:in|company)\\/([\\w\\-]+)/,
                youtube:   /youtube\\.com\\/@?([\\w\\-]+)/,
                tiktok:    /tiktok\\.com\\/@([\\w.]+)/,
                github:    /github\\.com\\/([\\w\\-]+)/,
                telegram:  /t\\.me\\/([\\w]+)/,
                pinterest: /pinterest\\.com\\/([\\w]+)/,
            }};
            const all_hrefs = [...document.querySelectorAll("a[href]")].map(a=>a.href);
            all_hrefs.forEach(h => {{
                for (const [k,p] of Object.entries(patterns)) {{
                    if (!social[k] && p.test(h)) social[k] = h;
                }}
            }});

            return {{
                emails:     [...new Set([...emails, ...mailto_links])],
                phones:     [...new Set([...phones, ...tel_links])],
                whatsapp:   wa_links,
                skype:      skype_links,
                social_links: social,
            }};
        }}''')
        print(json.dumps({{"ok": True, "contacts": data}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Contact extraction failed"))
    return r.get("contacts", {})


# ══════════════════════════════════════════════════════════════════════════════
# STRUCTURED DATA
# ══════════════════════════════════════════════════════════════════════════════

def extract_structured_data(url: str, timeout: int = 45) -> dict:
    """Extract all structured/schema data from a page.
    Returns {json_ld, microdata, rdfa, open_graph, twitter_card, meta_tags}."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        data = page.evaluate('''() => {{
            // JSON-LD
            const json_ld = [];
            document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {{
                try {{ json_ld.push(JSON.parse(s.textContent)); }} catch {{}}
            }});

            // Open Graph
            const og = {{}};
            document.querySelectorAll('meta[property^="og:"]').forEach(m =>
                og[m.getAttribute("property")] = m.content);

            // Twitter Card
            const tw = {{}};
            document.querySelectorAll('meta[name^="twitter:"]').forEach(m =>
                tw[m.name] = m.content);

            // All meta
            const meta = {{}};
            document.querySelectorAll("meta").forEach(m => {{
                const k = m.name || m.getAttribute("property") || m.getAttribute("http-equiv") || "";
                if (k) meta[k] = m.content || m.getAttribute("content") || "";
            }});

            // Microdata (itemscope/itemprop)
            const microdata = [];
            document.querySelectorAll("[itemscope]").forEach(el => {{
                const type = el.getAttribute("itemtype") || "";
                const props = {{}};
                el.querySelectorAll("[itemprop]").forEach(p => {{
                    props[p.getAttribute("itemprop")] = p.content || p.innerText?.trim() || p.href || p.src || "";
                }});
                microdata.push({{type, props}});
            }});

            // Page info
            const title  = document.title;
            const desc   = document.querySelector('meta[name="description"]')?.content || "";
            const canon  = document.querySelector('link[rel="canonical"]')?.href || "";
            const robots = document.querySelector('meta[name="robots"]')?.content || "";
            const lang   = document.documentElement.lang || "";

            return {{json_ld, open_graph: og, twitter_card: tw, meta_tags: meta,
                     microdata, title, description: desc, canonical: canon, robots, lang}};
        }}''')
        print(json.dumps({{"ok": True, "data": data}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Structured data extraction failed"))
    return r.get("data", {})


def extract_product_info(url: str, timeout: int = 45) -> dict:
    """Extract e-commerce product info from any product page.
    Returns {name, price, currency, description, images, sku, rating, reviews,
             availability, brand, breadcrumbs}."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        data = page.evaluate('''() => {{
            // Try JSON-LD first (most reliable)
            let ld = null;
            document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {{
                try {{
                    const d = JSON.parse(s.textContent);
                    if (d["@type"] === "Product" || (Array.isArray(d["@graph"]) &&
                        d["@graph"].some(x => x["@type"]==="Product"))) ld = d;
                }} catch {{}}
            }});
            const product = ld?.["@graph"]?.find(x=>x["@type"]==="Product") || ld || {{}};

            // Open Graph fallback
            const og_title = document.querySelector('meta[property="og:title"]')?.content || "";
            const og_price = document.querySelector('meta[property="product:price:amount"]')?.content || "";
            const og_currency = document.querySelector('meta[property="product:price:currency"]')?.content || "";
            const og_img   = document.querySelector('meta[property="og:image"]')?.content || "";
            const og_desc  = document.querySelector('meta[property="og:description"]')?.content || "";

            // DOM fallback selectors (common patterns)
            const name    = product.name || og_title || document.querySelector('[itemprop="name"], h1.product-title, h1.product_title, .product-name h1')?.innerText?.trim() || document.querySelector("h1")?.innerText?.trim() || "";
            const desc    = product.description || og_desc || document.querySelector('[itemprop="description"], .product-description, #product-description, .description')?.innerText?.trim() || "";
            const sku     = product.sku || document.querySelector('[itemprop="sku"], .sku, .product-sku')?.innerText?.trim() || "";
            const brand   = product.brand?.name || document.querySelector('[itemprop="brand"], .brand')?.innerText?.trim() || "";

            // Price
            const offers = product.offers || product.Offers || {{}};
            let price = offers.price || og_price ||
                document.querySelector('[itemprop="price"], .price, .product-price, [class*="price"]')?.getAttribute("content") ||
                document.querySelector('[itemprop="price"], .price .amount, .woocommerce-Price-amount')?.innerText?.trim() || "";
            let currency = offers.priceCurrency || og_currency ||
                document.querySelector('[itemprop="priceCurrency"]')?.getAttribute("content") || "";

            // Images
            const images = [];
            const og_imgs = [...document.querySelectorAll('meta[property="og:image"]')].map(m=>m.content);
            const prod_imgs = [...document.querySelectorAll('[itemprop="image"], .product-images img, .product-gallery img, .swiper-slide img')].map(i=>i.src||i.dataset.src||"").filter(Boolean);
            images.push(...new Set([...og_imgs, ...prod_imgs]));

            // Rating
            const rating = product.aggregateRating?.ratingValue ||
                document.querySelector('[itemprop="ratingValue"]')?.content ||
                document.querySelector('.rating, .star-rating, [class*="rating"]')?.innerText?.trim() || "";
            const reviews = product.aggregateRating?.reviewCount ||
                document.querySelector('[itemprop="reviewCount"]')?.content || "";

            // Availability
            const avail = offers.availability?.replace("https://schema.org/","") ||
                document.querySelector('[itemprop="availability"]')?.getAttribute("content")?.replace("https://schema.org/","") ||
                document.querySelector('.availability, .stock, .in-stock')?.innerText?.trim() || "";

            // Breadcrumbs
            const crumbs = [...document.querySelectorAll('nav[aria-label="Breadcrumb"] a, .breadcrumb a, .breadcrumbs a, [class*="breadcrumb"] a')].map(a=>a.innerText.trim());

            return {{name, description: desc, price, currency, sku, brand, availability: avail,
                     rating, reviews, images, breadcrumbs: crumbs}};
        }}''')
        print(json.dumps({{"ok": True, "data": data}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Product info extraction failed"))
    return r.get("data", {})


# ══════════════════════════════════════════════════════════════════════════════
# ARTICLE / BLOG EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def extract_article(url: str, timeout: int = 45) -> dict:
    """Extract article/blog content using Readability-style extraction.
    Returns {title, author, date, content, word_count, images, tags, description}."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        data = page.evaluate('''() => {{
            // Try JSON-LD Article
            let ld = null;
            document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {{
                try {{
                    const d = JSON.parse(s.textContent);
                    const types = ["Article","NewsArticle","BlogPosting","WebPage"];
                    if (types.includes(d["@type"])) ld = d;
                }} catch {{}}
            }});

            const title  = ld?.headline || document.querySelector('meta[property="og:title"]')?.content || document.querySelector("h1")?.innerText?.trim() || document.title || "";
            const author = ld?.author?.name || document.querySelector('[rel="author"], [itemprop="author"] [itemprop="name"], .author-name, .byline')?.innerText?.trim() || document.querySelector('meta[name="author"]')?.content || "";
            const date   = ld?.datePublished || document.querySelector('time[datetime]')?.getAttribute("datetime") || document.querySelector('meta[property="article:published_time"]')?.content || "";
            const desc   = ld?.description || document.querySelector('meta[name="description"]')?.content || document.querySelector('meta[property="og:description"]')?.content || "";
            const tags   = [...document.querySelectorAll('meta[property="article:tag"], .tag a, .tags a, [rel="tag"]')].map(t=>t.content||t.innerText?.trim()).filter(Boolean);

            // Main content — try common selectors then fall back to longest <p> block
            const content_el = document.querySelector(
                "article, [role='main'], main, .post-content, .article-content, .entry-content, .story-content, #content, .content-body"
            );
            const content = content_el?.innerText?.trim() || document.body?.innerText?.trim() || "";

            // Images in article
            const imgs = [...(content_el || document).querySelectorAll("img")].map(i=>({
                src: i.src, alt: i.alt, width: i.naturalWidth, height: i.naturalHeight
            })).filter(i=>i.src?.startsWith("http"));

            return {{title, author, date, description: desc, tags,
                     content: content.slice(0, 100000),
                     word_count: content.split(/\\s+/).filter(Boolean).length,
                     images: imgs.slice(0, 50)}};
        }}''')
        print(json.dumps({{"ok": True, "data": data}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Article extraction failed"))
    return r.get("data", {})


# ══════════════════════════════════════════════════════════════════════════════
# RSS / ATOM FEED PARSING
# ══════════════════════════════════════════════════════════════════════════════

def parse_rss(url: str, limit: int = 50) -> list:
    """Parse an RSS or Atom feed. Returns list of {title, link, date, summary, author}."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            xml = r.read().decode("utf-8", errors="replace")
    except Exception as e:
        raise RuntimeError(f"Feed fetch failed: {e}")

    items = []
    # RSS items
    for m in re.finditer(r"<item>(.*?)</item>", xml, re.DOTALL):
        chunk = m.group(1)
        def _tag(name):
            t = re.search(rf"<{name}[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</{name}>", chunk, re.DOTALL)
            return t.group(1).strip() if t else ""
        items.append({
            "title": _tag("title"), "link": _tag("link") or _tag("guid"),
            "date": _tag("pubDate") or _tag("dc:date"),
            "summary": re.sub(r"<[^>]+>", "", _tag("description"))[:500],
            "author": _tag("author") or _tag("dc:creator"),
        })

    # Atom entries
    if not items:
        for m in re.finditer(r"<entry>(.*?)</entry>", xml, re.DOTALL):
            chunk = m.group(1)
            def _tag(name):
                t = re.search(rf"<{name}[^>]*>(.*?)</{name}>", chunk, re.DOTALL)
                return t.group(1).strip() if t else ""
            link_m = re.search(r'<link[^>]+href=["\']([^"\']+)["\']', chunk)
            items.append({
                "title": re.sub(r"<[^>]+>", "", _tag("title")),
                "link": link_m.group(1) if link_m else _tag("id"),
                "date": _tag("published") or _tag("updated"),
                "summary": re.sub(r"<[^>]+>", "", _tag("summary") or _tag("content"))[:500],
                "author": re.sub(r"<[^>]+>", "", _tag("author")),
            })

    return items[:limit]


def discover_feeds(url: str, timeout: int = 30) -> list:
    """Find RSS/Atom feed URLs on a page. Returns list of feed URLs."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        feeds = page.evaluate('''() => {{
            const links = [...document.querySelectorAll(
                'link[type="application/rss+xml"], link[type="application/atom+xml"]'
            )];
            return links.map(l => ({{title: l.title, href: l.href}}));
        }}''')
        print(json.dumps({{"ok": True, "feeds": feeds}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        return []
    return r.get("feeds", [])


# ══════════════════════════════════════════════════════════════════════════════
# SITEMAP PARSING
# ══════════════════════════════════════════════════════════════════════════════

def parse_sitemap(url: str, max_urls: int = 500) -> list:
    """Parse an XML sitemap (including sitemap index). Returns list of {loc, lastmod, priority}."""
    def _fetch(u):
        try:
            req = urllib.request.Request(u, headers={"User-Agent": _UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception:
            return ""

    def _parse_xml(xml):
        entries = []
        # Sitemap index
        for m in re.finditer(r"<sitemap>(.*?)</sitemap>", xml, re.DOTALL):
            loc = re.search(r"<loc>(.*?)</loc>", m.group(1))
            if loc:
                entries.extend(_parse_xml(_fetch(loc.group(1).strip())))
        # URL entries
        for m in re.finditer(r"<url>(.*?)</url>", xml, re.DOTALL):
            chunk = m.group(1)
            loc  = re.search(r"<loc>(.*?)</loc>", chunk)
            lmod = re.search(r"<lastmod>(.*?)</lastmod>", chunk)
            pri  = re.search(r"<priority>(.*?)</priority>", chunk)
            if loc:
                entries.append({
                    "loc": loc.group(1).strip(),
                    "lastmod": lmod.group(1).strip() if lmod else "",
                    "priority": pri.group(1).strip() if pri else "",
                })
        return entries

    if not url.endswith(".xml"):
        # Try robots.txt for sitemap location
        base = urllib.parse.urlparse(url)
        robots_url = f"{base.scheme}://{base.netloc}/robots.txt"
        robots = _fetch(robots_url)
        sitemap_urls = re.findall(r"Sitemap:\s*(\S+)", robots, re.IGNORECASE)
        if sitemap_urls:
            url = sitemap_urls[0]
        else:
            url = f"{base.scheme}://{base.netloc}/sitemap.xml"

    xml = _fetch(url)
    if not xml:
        raise RuntimeError(f"Could not fetch sitemap from {url}")
    return _parse_xml(xml)[:max_urls]


# ══════════════════════════════════════════════════════════════════════════════
# SITE CRAWLER
# ══════════════════════════════════════════════════════════════════════════════

def crawl_site(start_url: str, max_pages: int = 50, same_domain: bool = True,
               timeout_each: int = 30) -> list:
    """Crawl a website starting from start_url.
    Returns list of {url, title, description, word_count, links_count, status}."""
    from urllib.parse import urlparse
    base_origin = urlparse(start_url).netloc
    visited = set()
    queue = [start_url]
    results = []

    while queue and len(visited) < max_pages:
        url = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)

        script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        resp = page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout={timeout_each * 1000})
        status = resp.status if resp else 0
        wait_full(page, timeout=5000)
        data = page.evaluate('''() => {{
            return {{
                title: document.title,
                desc:  document.querySelector('meta[name="description"]')?.content || "",
                text_len: document.body?.innerText?.length || 0,
                links: [...document.querySelectorAll("a[href]")].map(a => a.href).filter(h => h.startsWith("http")).slice(0, 100),
            }};
        }}''')
        data["status"] = status
        print(json.dumps({{"ok": True, "data": data}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
        r = _run(script, timeout_each + 15)
        if r.get("ok"):
            d = r.get("data", {})
            results.append({
                "url": url,
                "title": d.get("title", ""),
                "description": d.get("desc", ""),
                "word_count": d.get("text_len", 0) // 5,
                "links_count": len(d.get("links", [])),
                "status": d.get("status", 0),
            })
            # Queue new links
            for link in d.get("links", []):
                parsed = urlparse(link)
                if same_domain and parsed.netloc != base_origin:
                    continue
                clean = f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip("/")
                if clean not in visited and clean not in queue:
                    queue.append(clean)
        else:
            results.append({"url": url, "status": "error", "error": r.get("error", "")})

    return results


# ══════════════════════════════════════════════════════════════════════════════
# MULTI-URL PARALLEL SCRAPING
# ══════════════════════════════════════════════════════════════════════════════

def scrape_many(urls: list, mode: str = "text", workers: int = 4,
                timeout: int = 60) -> list:
    """Scrape multiple URLs in parallel using subprocess workers.
    mode = 'text' | 'full' | 'article' | 'contacts' | 'product'
    Returns list of results in same order as input URLs."""
    import concurrent.futures

    fn_map = {
        "text":     lambda u: {"url": u, "text": scrape_text(u, timeout=timeout)},
        "full":     lambda u: {"url": u, **scrape_page(u, timeout=timeout)},
        "article":  lambda u: {"url": u, **extract_article(u, timeout=timeout)},
        "contacts": lambda u: {"url": u, **extract_contacts(u, timeout=timeout)},
        "product":  lambda u: {"url": u, **extract_product_info(u, timeout=timeout)},
    }
    fn = fn_map.get(mode, fn_map["text"])

    def _safe(url):
        try:
            return fn(url)
        except Exception as e:
            return {"url": url, "error": str(e)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(_safe, urls))


# ══════════════════════════════════════════════════════════════════════════════
# TEXT-ONLY FAST SCRAPE (static HTML via urllib — no browser)
# ══════════════════════════════════════════════════════════════════════════════

def scrape_text(url: str, timeout: int = 30) -> str:
    """Fast static-HTML text extraction without a browser. Falls back to Playwright if needed."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": _UA,
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            html = r.read().decode(r.headers.get_content_charset() or "utf-8", errors="replace")
        # Strip scripts/styles
        html = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r"<style[^>]*>.*?</style>", " ", html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r"<[^>]+>", " ", html)
        return re.sub(r"\s{2,}", "\n", html).strip()[:50000]
    except Exception:
        # Fallback to Playwright for JS-rendered pages
        script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout={timeout * 1000})
        wait_full(page, timeout=5000)
        text = page.inner_text("body")
        print(json.dumps({{"ok": True, "text": text[:50000]}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
        r = _run(script, timeout + 15)
        if not r.get("ok"):
            raise RuntimeError(r.get("error", "Text scrape failed"))
        return r.get("text", "")


def scrape_links(url: str, internal_only: bool = False, timeout: int = 30) -> list:
    """Fast link extraction using static HTML fetch.
    Returns list of absolute URL strings."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            html = r.read().decode(r.headers.get_content_charset() or "utf-8", errors="replace")
        base_origin = urllib.parse.urlparse(url).netloc
        hrefs = re.findall(r'href=["\']([^"\'#]+)["\']', html, re.IGNORECASE)
        links = []
        seen = set()
        for h in hrefs:
            abs_url = urllib.parse.urljoin(url, h)
            if not abs_url.startswith("http"):
                continue
            if internal_only and urllib.parse.urlparse(abs_url).netloc != base_origin:
                continue
            if abs_url not in seen:
                seen.add(abs_url)
                links.append(abs_url)
        return links
    except Exception as e:
        raise RuntimeError(f"Link scrape failed: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# TABLE EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def scrape_all_tables(url: str, timeout: int = 45) -> list:
    """Extract all HTML tables from a page as list of dicts.
    Returns list of tables; each table is a list of row dicts."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        tables = page.evaluate('''() => {{
            return [...document.querySelectorAll("table")].map(t => {{
                const rows = [...t.querySelectorAll("tr")].map(r =>
                    [...r.querySelectorAll("th,td")].map(c => c.innerText.trim())
                );
                return rows;
            }});
        }}''')
        result = []
        for rows in tables:
            if len(rows) < 2: continue
            headers = rows[0]
            result.append([dict(zip(headers, row)) for row in rows[1:]])
        print(json.dumps({{"ok": True, "tables": result}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Table scrape failed"))
    return r.get("tables", [])


# ══════════════════════════════════════════════════════════════════════════════
# FORM INTERACTION
# ══════════════════════════════════════════════════════════════════════════════

def submit_form(url: str, fields: dict, submit_selector: str = '[type="submit"]',
                wait_ms: int = 3000, timeout: int = 45) -> dict:
    """Fill and submit a web form. Returns {url, html, title} of the result page."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        fields = {json.dumps(fields)}
        for sel, val in fields.items():
            try:
                page.fill(sel, str(val))
            except Exception:
                try:
                    page.select_option(sel, str(val))
                except Exception:
                    pass
        page.click({json.dumps(submit_selector)})
        page.wait_for_timeout({wait_ms})
        wait_full(page)
        print(json.dumps({{
            "ok": True,
            "url": page.url,
            "title": page.title(),
            "html": page.content()[:50000],
        }}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Form submit failed"))
    return r


def search_site(site_url: str, query: str, search_input_selector: str = 'input[type="search"], input[name="q"], input[name="s"]',
                timeout: int = 45) -> dict:
    """Type a query into a site's search box and return the results page."""
    return submit_form(site_url, {search_input_selector: query},
                       submit_selector='[type="submit"], button[type="submit"], .search-submit',
                       timeout=timeout)


# ══════════════════════════════════════════════════════════════════════════════
# MEDIA: VIDEO & AUDIO URL EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def extract_media_urls(url: str, timeout: int = 60) -> dict:
    """Extract all media URLs (video, audio, embedded iframes) from a page.
    Returns {videos, audios, iframes, youtube, vimeo, streaming}."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        media = page.evaluate('''() => {{
            const abs = h => {{ try {{ return new URL(h, document.baseURI).href; }} catch {{ return h; }} }};
            const videos = [...document.querySelectorAll("video source, video[src]")].map(v=>({{
                src: abs(v.src || v.getAttribute("src")||""), type: v.type||"",
            }})).filter(v=>v.src);
            const audios = [...document.querySelectorAll("audio source, audio[src]")].map(a=>({{
                src: abs(a.src||a.getAttribute("src")||""), type: a.type||"",
            }})).filter(a=>a.src);
            const iframes= [...document.querySelectorAll("iframe[src]")].map(f=>abs(f.src)).filter(Boolean);
            const youtube = iframes.filter(s=>s.includes("youtube.com")||s.includes("youtu.be"));
            const vimeo   = iframes.filter(s=>s.includes("vimeo.com"));
            const other   = iframes.filter(s=>!s.includes("youtube")&&!s.includes("vimeo"));
            // M3U8/MPD streaming
            const page_src = document.documentElement.innerHTML;
            const m3u8 = [...new Set((page_src.match(/https?:\\/\\/[^"' >]+\\.m3u8[^"' >]*/g)||[]))];
            const mpd  = [...new Set((page_src.match(/https?:\\/\\/[^"' >]+\\.mpd[^"' >]*/g)||[]))];
            return {{videos, audios, iframes: other, youtube, vimeo, streaming: {{m3u8, mpd}}}};
        }}''')
        print(json.dumps({{"ok": True, "media": media}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Media extraction failed"))
    return r.get("media", {})


# ══════════════════════════════════════════════════════════════════════════════
# NETWORK REQUESTS INTERCEPTION
# ══════════════════════════════════════════════════════════════════════════════

def intercept_requests(url: str, filter_pattern: str = "", timeout: int = 30) -> list:
    """Intercept all network requests made by a page (useful to find hidden APIs).
    filter_pattern = regex string to filter request URLs.
    Returns list of {url, method, resource_type, status}."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    import re as _re
    requests_log = []
    def on_request(req):
        url = req.url
        if not {json.dumps(filter_pattern)} or _re.search({json.dumps(filter_pattern)}, url):
            requests_log.append({{"url": url, "method": req.method, "type": req.resource_type}})
    page.on("request", on_request)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page)
        print(json.dumps({{"ok": True, "requests": requests_log[:200]}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout + 15)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Request intercept failed"))
    return r.get("requests", [])


def find_api_endpoints(url: str, timeout: int = 30) -> list:
    """Find API/XHR/fetch calls made by a page. Returns list of API request URLs."""
    reqs = intercept_requests(url, filter_pattern=r"api|json|graphql|rest|data|ajax", timeout=timeout)
    return [r["url"] for r in reqs if r.get("type") in ("xhr", "fetch", "")]


# ══════════════════════════════════════════════════════════════════════════════
# COOKIES & LOCAL STORAGE
# ══════════════════════════════════════════════════════════════════════════════

def get_page_storage(url: str, timeout: int = 30) -> dict:
    """Get cookies, localStorage, and sessionStorage from a page.
    Returns {cookies, local_storage, session_storage}."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        wait_full(page, timeout=5000)
        cookies = ctx.cookies()
        storage = page.evaluate('''() => {{
            const ls = {{}};
            for (let i = 0; i < localStorage.length; i++) {{
                const k = localStorage.key(i);
                ls[k] = localStorage.getItem(k);
            }}
            const ss = {{}};
            for (let i = 0; i < sessionStorage.length; i++) {{
                const k = sessionStorage.key(i);
                ss[k] = sessionStorage.getItem(k);
            }}
            return {{local: ls, session: ss}};
        }}''')
        print(json.dumps({{"ok": True, "cookies": cookies,
                           "local_storage": storage.get("local", {{}}),
                           "session_storage": storage.get("session", {{}})}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout + 10)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Storage retrieval failed"))
    return {"cookies": r.get("cookies", []),
            "local_storage": r.get("local_storage", {}),
            "session_storage": r.get("session_storage", {})}


# ══════════════════════════════════════════════════════════════════════════════
# PERFORMANCE & TECH STACK DETECTION
# ══════════════════════════════════════════════════════════════════════════════

def detect_tech_stack(url: str, timeout: int = 30) -> dict:
    """Detect technologies used by a website.
    Returns {cms, frameworks, analytics, cdn, server, fonts, libraries}."""
    script = f"""
with sync_playwright() as pw:
    browser, ctx, page = new_page(pw)
    try:
        resp = page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        headers = dict(resp.headers()) if resp else {{}}
        wait_full(page, timeout=5000)
        tech = page.evaluate('''() => {{
            const html = document.documentElement.innerHTML;
            const scripts = [...document.querySelectorAll("script[src]")].map(s=>s.src);
            const links   = [...document.querySelectorAll("link[href]")].map(l=>l.href);
            const all = html + scripts.join(" ") + links.join(" ");
            const detect = (patterns) => Object.entries(patterns)
                .filter(([k,p]) => p.test(all)).map(([k]) => k);

            const cms = detect({{
                WordPress:  /wp-content|wp-includes|wordpress/i,
                Shopify:    /cdn\\.shopify\\.com|shopify/i,
                Wix:        /wix\\.com|wixstatic/i,
                Squarespace:/squarespace\\.com/i,
                Webflow:    /webflow\\.com/i,
                Ghost:      /ghost\\.org|content\\.ghost\\.io/i,
                Joomla:     /joomla/i,
                Drupal:     /drupal/i,
                Magento:    /magento|mage\\./i,
                HubSpot:    /hubspot|hs-scripts/i,
            }});
            const js_frameworks = detect({{
                React:      /react(?:\\.min)?\\.js|__REACT|_reactFiber/i,
                Vue:        /vue(?:\\.min)?\\.js|__vue__|v-bind/i,
                Angular:    /angular(?:\\.min)?\\.js|ng-version/i,
                NextJS:     /__NEXT_DATA__|next\\/static/i,
                NuxtJS:     /__NUXT__|_nuxt\\//i,
                Svelte:     /svelte/i,
                jQuery:     /jquery(?:\\.min)?\\.js/i,
                Bootstrap:  /bootstrap(?:\\.min)?\\.css/i,
                Tailwind:   /tailwind/i,
            }});
            const analytics = detect({{
                "Google Analytics": /google-analytics\\.com|gtag\\(|ga\\(/i,
                "Google Tag Manager": /googletagmanager\\.com/i,
                "Facebook Pixel": /connect\\.facebook\\.net|fbq\\(/i,
                Hotjar:     /hotjar\\.com/i,
                Mixpanel:   /mixpanel\\.com/i,
                Segment:    /segment\\.com/i,
                Amplitude:  /amplitude\\.com/i,
                Clarity:    /clarity\\.ms/i,
            }});
            const fonts = detect({{
                "Google Fonts": /fonts\\.googleapis\\.com/i,
                Typekit:    /use\\.typekit\\.net/i,
                "Font Awesome": /fontawesome/i,
            }});
            const cdn = detect({{
                Cloudflare: /cloudflare/i,
                Fastly:     /fastly/i,
                Cloudfront: /cloudfront\\.net/i,
                Akamai:     /akamai/i,
            }});
            return {{cms, js_frameworks, analytics, fonts, cdn}};
        }}''')
        tech["server_headers"] = {{
            "server": headers.get("server",""),
            "x_powered_by": headers.get("x-powered-by",""),
            "x_generator": headers.get("x-generator",""),
        }}
        print(json.dumps({{"ok": True, "tech": tech}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout + 10)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Tech detection failed"))
    return r.get("tech", {})


# ══════════════════════════════════════════════════════════════════════════════
# CONVENIENCE: one-shot "get everything"
# ══════════════════════════════════════════════════════════════════════════════

def deep_scrape(url: str, include_images: bool = True, include_files: bool = True,
                save_dir: str = None, timeout: int = 90) -> dict:
    """Maximum extraction from a single URL.

    Returns:
        page    — full scrape_page() result
        tech    — detect_tech_stack() result
        media   — extract_media_urls() result
        feeds   — discover_feeds() result
        contacts— extract_contacts() result
        images_saved — list of saved image paths (if save_dir given)
        files_saved  — list of saved file paths (if save_dir given)
    """
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        f_page     = ex.submit(scrape_page, url, True, timeout)
        f_tech     = ex.submit(detect_tech_stack, url, 30)
        f_media    = ex.submit(extract_media_urls, url, 45)
        f_feeds    = ex.submit(discover_feeds, url, 20)
        f_contacts = ex.submit(extract_contacts, url, 45)

    result = {
        "url": url,
        "page":     f_page.result() if not f_page.exception() else {"error": str(f_page.exception())},
        "tech":     f_tech.result() if not f_tech.exception() else {},
        "media":    f_media.result() if not f_media.exception() else {},
        "feeds":    f_feeds.result() if not f_feeds.exception() else [],
        "contacts": f_contacts.result() if not f_contacts.exception() else {},
    }

    if save_dir:
        if include_images:
            try:
                result["images_saved"] = download_all_images(url, os.path.join(save_dir, "images"))
            except Exception as e:
                result["images_saved"] = {"error": str(e)}
        if include_files:
            try:
                result["files_saved"] = download_all_files(url, os.path.join(save_dir, "files"))
            except Exception as e:
                result["files_saved"] = {"error": str(e)}

    return result
