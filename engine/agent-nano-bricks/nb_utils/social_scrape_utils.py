"""
Social Media Scraping Utilities — headless Playwright, stealth mode.

Covers: Twitter/X, Instagram, Facebook, LinkedIn, YouTube, Reddit, TikTok,
        Pinterest, Telegram (public), Medium, Quora, GitHub, Threads, Mastodon.

All functions run Playwright in a subprocess (same pattern as scrape_utils).
Every function raises RuntimeError if Playwright is missing.

Quick start:
    import social_scrape_utils as ss

    posts  = ss.twitter_profile("elonmusk", limit=20)
    videos = ss.youtube_channel("https://youtube.com/@mkbhd", limit=10)
    subs   = ss.reddit_posts("r/python", limit=25)
    jobs   = ss.linkedin_jobs("python developer", location="Remote", limit=30)
"""
import json
import subprocess
import sys

# ── Stealth browser arguments (defeat most bot-detection) ─────────────────────
_ARGS = json.dumps([
    "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars", "--window-size=1440,900",
    "--disable-extensions", "--no-first-run",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
])

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

_STEALTH_JS = """
    Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
    Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3]});
    Object.defineProperty(navigator, 'languages', {get: () => ['en-US','en']});
    window.chrome = {runtime: {}};
"""

# ── Core subprocess runner ─────────────────────────────────────────────────────

def _run(script: str, timeout: int = 90) -> dict:
    full = f"""
import sys, json
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print(json.dumps({{"ok": False, "error": "playwright_missing"}}))
    sys.exit(0)

STEALTH_JS = {json.dumps(_STEALTH_JS)}

def new_page(pw):
    browser = pw.chromium.launch(headless=True, args={_ARGS})
    ctx = browser.new_context(
        user_agent={json.dumps(_UA)},
        viewport={{"width": 1440, "height": 900}},
        locale="en-US",
        timezone_id="America/New_York",
        extra_http_headers={{"Accept-Language": "en-US,en;q=0.9"}},
    )
    ctx.add_init_script(STEALTH_JS)
    page = ctx.new_page()
    page.set_default_timeout(30000)
    return browser, page

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
        return {"ok": False, "error": err[:2000] or "No output"}
    try:
        return json.loads(out.split("\n")[-1])  # last JSON line
    except json.JSONDecodeError:
        return {"ok": True, "raw": out[:8000]}


def _scroll_load(page_var: str, times: int = 5, pause: int = 1500) -> str:
    return f"""
for _si in range({times}):
    {page_var}.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    {page_var}.wait_for_timeout({pause})
"""


# ══════════════════════════════════════════════════════════════════════════════
# TWITTER / X
# ══════════════════════════════════════════════════════════════════════════════

def twitter_profile(username: str, limit: int = 20, timeout: int = 60) -> list:
    """Scrape public tweets from a Twitter/X profile.
    Returns list of {text, date, likes, retweets, replies, url}."""
    username = username.lstrip("@")
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto("https://x.com/{username}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        {_scroll_load("page", times=8, pause=1800)}
        tweets = page.evaluate('''() => {{
            const arts = [...document.querySelectorAll('article[data-testid="tweet"]')];
            return arts.slice(0, {limit}).map(a => {{
                const text = a.querySelector('[data-testid="tweetText"]')?.innerText || "";
                const date = a.querySelector("time")?.getAttribute("datetime") || "";
                const url  = a.querySelector("time")?.closest("a")?.href || "";
                const stats = [...a.querySelectorAll('[data-testid$="-count"]')].map(e => e.innerText);
                return {{text, date, url,
                    replies: stats[0]||"0", retweets: stats[1]||"0", likes: stats[2]||"0"}};
            }});
        }}''')
        print(json.dumps({{"ok": True, "tweets": tweets}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Twitter scrape failed"))
    return r.get("tweets", [])


def twitter_search(query: str, limit: int = 20, timeout: int = 60) -> list:
    """Search Twitter/X for recent tweets matching query.
    Returns list of {text, username, date, likes, url}."""
    import urllib.parse
    q = urllib.parse.quote(query)
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto("https://x.com/search?q={q}&src=typed_query&f=live", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        {_scroll_load("page", times=6, pause=1800)}
        results = page.evaluate('''() => {{
            const arts = [...document.querySelectorAll('article[data-testid="tweet"]')];
            return arts.slice(0, {limit}).map(a => {{
                const text = a.querySelector('[data-testid="tweetText"]')?.innerText || "";
                const user = a.querySelector('[data-testid="User-Name"]')?.innerText?.split("\\n")[0] || "";
                const date = a.querySelector("time")?.getAttribute("datetime") || "";
                const url  = a.querySelector("time")?.closest("a")?.href || "";
                const likes = a.querySelector('[data-testid="like-count"]')?.innerText || "0";
                return {{text, username: user, date, likes, url}};
            }});
        }}''')
        print(json.dumps({{"ok": True, "results": results}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Twitter search failed"))
    return r.get("results", [])


def twitter_trending(region: str = "worldwide", timeout: int = 45) -> list:
    """Get current trending topics on Twitter/X.
    Returns list of {rank, topic, tweet_count}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto("https://x.com/explore/tabs/trending", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        trends = page.evaluate('''() => {{
            const cells = [...document.querySelectorAll('[data-testid="trend"]')];
            return cells.map((c, i) => {{
                const spans = [...c.querySelectorAll("span")].map(s => s.innerText.trim()).filter(Boolean);
                return {{rank: i+1, topic: spans[1]||spans[0]||"", tweet_count: spans[spans.length-1]||""}};
            }});
        }}''')
        print(json.dumps({{"ok": True, "trends": trends}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Twitter trending failed"))
    return r.get("trends", [])


# ══════════════════════════════════════════════════════════════════════════════
# INSTAGRAM
# ══════════════════════════════════════════════════════════════════════════════

def instagram_profile(username: str, timeout: int = 60) -> dict:
    """Scrape public Instagram profile info.
    Returns {username, full_name, bio, followers, following, posts, profile_pic}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto("https://www.instagram.com/{username}/", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        data = page.evaluate('''() => {{
            const meta = [...document.querySelectorAll("meta")];
            const desc = meta.find(m => m.name === "description")?.content || "";
            const title = document.title || "";
            const img = document.querySelector("img[alt*='profile picture']")?.src || "";
            const counts = [...document.querySelectorAll("span._ac2a, li span span, header ul li span span")]
                            .map(e => e.innerText.trim()).filter(Boolean);
            return {{title, desc, profile_pic: img, counts}};
        }}''')
        print(json.dumps({{"ok": True, "data": data}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Instagram scrape failed"))
    d = r.get("data", {})
    desc = d.get("desc", "")
    counts = d.get("counts", [])
    return {
        "username": username,
        "full_name": d.get("title", "").replace(" • Instagram", "").strip(),
        "bio": desc,
        "followers": counts[1] if len(counts) > 1 else "",
        "following": counts[2] if len(counts) > 2 else "",
        "posts": counts[0] if counts else "",
        "profile_pic": d.get("profile_pic", ""),
    }


def instagram_hashtag(hashtag: str, limit: int = 20, timeout: int = 60) -> list:
    """Scrape public posts for a hashtag. Returns list of {url, alt_text}."""
    hashtag = hashtag.lstrip("#")
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto("https://www.instagram.com/explore/tags/{hashtag}/", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        posts = page.evaluate('''() => {{
            const imgs = [...document.querySelectorAll("article img, main img")];
            return imgs.slice(0, {limit}).map(i => ({{
                url: i.closest("a")?.href || "",
                alt_text: i.alt || "",
                src: i.src || ""
            }})).filter(p => p.url.includes("/p/"));
        }}''')
        print(json.dumps({{"ok": True, "posts": posts}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Instagram hashtag scrape failed"))
    return r.get("posts", [])


# ══════════════════════════════════════════════════════════════════════════════
# YOUTUBE
# ══════════════════════════════════════════════════════════════════════════════

def youtube_search(query: str, limit: int = 20, timeout: int = 60) -> list:
    """Search YouTube. Returns list of {title, url, channel, views, duration, description}."""
    import urllib.parse
    q = urllib.parse.quote(query)
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto("https://www.youtube.com/results?search_query={q}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        results = page.evaluate('''() => {{
            const items = [...document.querySelectorAll("ytd-video-renderer")];
            return items.slice(0, {limit}).map(el => ({{
                title: el.querySelector("#video-title")?.innerText?.trim() || "",
                url: "https://youtube.com" + (el.querySelector("#video-title")?.getAttribute("href") || ""),
                channel: el.querySelector("ytd-channel-name a")?.innerText?.trim() || "",
                views: el.querySelector(".ytd-video-meta-block span:first-child")?.innerText?.trim() || "",
                duration: el.querySelector("span.ytd-thumbnail-overlay-time-status-renderer")?.innerText?.trim() || "",
                description: el.querySelector("yt-formatted-string#description-text")?.innerText?.trim() || "",
            }}));
        }}''')
        print(json.dumps({{"ok": True, "results": results}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "YouTube search failed"))
    return r.get("results", [])


def youtube_channel(channel_url: str, limit: int = 20, timeout: int = 60) -> list:
    """Scrape videos from a YouTube channel page.
    Returns list of {title, url, views, date, duration}."""
    if not channel_url.endswith("/videos"):
        channel_url = channel_url.rstrip("/") + "/videos"
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto({json.dumps(channel_url)}, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        {_scroll_load("page", times=4, pause=1500)}
        videos = page.evaluate('''() => {{
            const items = [...document.querySelectorAll("ytd-rich-item-renderer, ytd-grid-video-renderer")];
            return items.slice(0, {limit}).map(el => ({{
                title: el.querySelector("#video-title")?.innerText?.trim() || "",
                url: "https://youtube.com" + (el.querySelector("a#thumbnail")?.getAttribute("href") || ""),
                views: el.querySelector("#metadata-line span:first-child")?.innerText?.trim() || "",
                date:  el.querySelector("#metadata-line span:last-child")?.innerText?.trim() || "",
                duration: el.querySelector("span.ytd-thumbnail-overlay-time-status-renderer")?.innerText?.trim() || "",
            }})).filter(v => v.title);
        }}''')
        print(json.dumps({{"ok": True, "videos": videos}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "YouTube channel scrape failed"))
    return r.get("videos", [])


def youtube_comments(video_url: str, limit: int = 30, timeout: int = 90) -> list:
    """Scrape comments from a YouTube video.
    Returns list of {author, text, likes, date}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto({json.dumps(video_url)}, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(4000)
        page.evaluate("window.scrollTo(0, 600)")
        page.wait_for_timeout(2000)
        for _ in range(6):
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(2000)
        comments = page.evaluate('''() => {{
            const items = [...document.querySelectorAll("ytd-comment-thread-renderer")];
            return items.slice(0, {limit}).map(el => ({{
                author: el.querySelector("#author-text span")?.innerText?.trim() || "",
                text:   el.querySelector("#content-text")?.innerText?.trim() || "",
                likes:  el.querySelector("#vote-count-middle")?.innerText?.trim() || "0",
                date:   el.querySelector(".published-time-text a")?.innerText?.trim() || "",
            }}));
        }}''')
        print(json.dumps({{"ok": True, "comments": comments}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "YouTube comments scrape failed"))
    return r.get("comments", [])


def youtube_video_info(video_url: str, timeout: int = 45) -> dict:
    """Get metadata for a YouTube video.
    Returns {title, description, channel, views, likes, date, tags}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto({json.dumps(video_url)}, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        info = page.evaluate('''() => {{
            const title = document.querySelector("h1.ytd-video-primary-info-renderer yt-formatted-string")?.innerText
                       || document.querySelector("title")?.innerText || "";
            const channel = document.querySelector("#channel-name a")?.innerText?.trim() || "";
            const views = document.querySelector(".view-count")?.innerText?.trim() || "";
            const date  = document.querySelector("#info-strings yt-formatted-string")?.innerText?.trim() || "";
            const likes = document.querySelector('[aria-label*="likes"] span')?.innerText?.trim() || "";
            const desc  = document.querySelector("#description-inline-expander yt-formatted-string")?.innerText?.trim() || "";
            const tags  = [...document.querySelectorAll("meta[property=\\'og:video:tag\\']")].map(m => m.content);
            return {{title, channel, views, date, likes, description: desc, tags}};
        }}''')
        print(json.dumps({{"ok": True, "info": info}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "YouTube video info failed"))
    return r.get("info", {})


# ══════════════════════════════════════════════════════════════════════════════
# REDDIT
# ══════════════════════════════════════════════════════════════════════════════

def reddit_posts(subreddit: str, sort: str = "hot", limit: int = 25, timeout: int = 60) -> list:
    """Scrape posts from a subreddit. sort = hot|new|top|rising.
    Returns list of {title, url, author, upvotes, comments, date, flair}."""
    sub = subreddit.lstrip("r/")
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://www.reddit.com/r/{sub}/{sort}/", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        {_scroll_load("page", times=4, pause=1500)}
        posts = page.evaluate('''() => {{
            const items = [...document.querySelectorAll("shreddit-post, [data-testid=\\'post-container\\']")];
            return items.slice(0, {limit}).map(el => {{
                const title = el.getAttribute("post-title") || el.querySelector("h3, [data-click-id=\\'text\\'] h3")?.innerText?.trim() || "";
                const url   = el.getAttribute("permalink") || el.querySelector("a[data-click-id=\\'body\\']")?.href || "";
                const author= el.getAttribute("author") || el.querySelector("[data-testid=\\'post_author_link\\']")?.innerText || "";
                const score = el.getAttribute("score") || el.querySelector("faceplate-number")?.innerText || "0";
                const cmts  = el.getAttribute("comment-count") || "";
                const flair = el.querySelector("flair-richtext, .flairrichtext")?.innerText?.trim() || "";
                return {{title, url: url.startsWith("http") ? url : "https://reddit.com" + url,
                         author, upvotes: score, comments: cmts, flair}};
            }}).filter(p => p.title);
        }}''')
        print(json.dumps({{"ok": True, "posts": posts}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Reddit scrape failed"))
    return r.get("posts", [])


def reddit_search(query: str, subreddit: str = "", limit: int = 25, timeout: int = 60) -> list:
    """Search Reddit. Optionally restrict to a subreddit.
    Returns list of {title, url, author, upvotes, subreddit}."""
    import urllib.parse
    base = f"https://www.reddit.com/r/{subreddit.lstrip('r/')}/search/" if subreddit else "https://www.reddit.com/search/"
    q = urllib.parse.quote(query)
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto("{base}?q={q}&sort=relevance", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        {_scroll_load("page", times=4, pause=1200)}
        posts = page.evaluate('''() => {{
            const items = [...document.querySelectorAll("shreddit-post, [data-testid=\\'post-container\\']")];
            return items.slice(0, {limit}).map(el => {{
                const title = el.getAttribute("post-title") || el.querySelector("h3")?.innerText?.trim() || "";
                const url   = el.getAttribute("permalink") || "";
                const sub   = el.getAttribute("subreddit-prefixed-name") || "";
                const score = el.getAttribute("score") || "0";
                const author= el.getAttribute("author") || "";
                return {{title, url: url ? "https://reddit.com" + url : "", subreddit: sub, upvotes: score, author}};
            }}).filter(p => p.title);
        }}''')
        print(json.dumps({{"ok": True, "posts": posts}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Reddit search failed"))
    return r.get("posts", [])


def reddit_comments(post_url: str, limit: int = 50, timeout: int = 60) -> list:
    """Scrape top-level comments from a Reddit post.
    Returns list of {author, text, upvotes, awards}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto({json.dumps(post_url)}, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        {_scroll_load("page", times=5, pause=1200)}
        comments = page.evaluate('''() => {{
            const items = [...document.querySelectorAll("shreddit-comment[depth=\\'0\\'], .Comment")];
            return items.slice(0, {limit}).map(el => {{
                const author = el.getAttribute("author") || el.querySelector("[data-testid=\\'comment_author_link\\']")?.innerText || "";
                const text   = el.querySelector("div[slot=\\'comment\\'] p, .RichTextJSON-root p")?.innerText?.trim() || "";
                const score  = el.getAttribute("score") || el.querySelector("faceplate-number")?.innerText || "0";
                return {{author, text, upvotes: score}};
            }}).filter(c => c.text);
        }}''')
        print(json.dumps({{"ok": True, "comments": comments}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Reddit comments scrape failed"))
    return r.get("comments", [])


# ══════════════════════════════════════════════════════════════════════════════
# LINKEDIN
# ══════════════════════════════════════════════════════════════════════════════

def linkedin_jobs(query: str, location: str = "", limit: int = 25, timeout: int = 60) -> list:
    """Scrape LinkedIn public job listings (no login required).
    Returns list of {title, company, location, date, url, description_snippet}."""
    import urllib.parse
    q = urllib.parse.quote(query)
    loc = urllib.parse.quote(location)
    url = f"https://www.linkedin.com/jobs/search/?keywords={q}&location={loc}&f_TPR=r86400"
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        {_scroll_load("page", times=5, pause=1500)}
        jobs = page.evaluate('''() => {{
            const cards = [...document.querySelectorAll(".job-search-card, .base-card")];
            return cards.slice(0, {limit}).map(c => ({{
                title:    c.querySelector(".base-search-card__title, h3")?.innerText?.trim() || "",
                company:  c.querySelector(".base-search-card__subtitle a, h4 a")?.innerText?.trim() || "",
                location: c.querySelector(".job-search-card__location, .base-search-card__metadata span")?.innerText?.trim() || "",
                date:     c.querySelector("time")?.getAttribute("datetime") || c.querySelector("time")?.innerText || "",
                url:      c.querySelector("a.base-card__full-link, a.result-card__full-card-link")?.href || "",
                snippet:  c.querySelector(".job-search-card__snippet")?.innerText?.trim() || "",
            }})).filter(j => j.title);
        }}''')
        print(json.dumps({{"ok": True, "jobs": jobs}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "LinkedIn jobs scrape failed"))
    return r.get("jobs", [])


def linkedin_company(company_url: str, timeout: int = 60) -> dict:
    """Scrape a LinkedIn public company page.
    Returns {name, tagline, about, industry, size, website, followers}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto({json.dumps(company_url)}, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        info = page.evaluate('''() => {{
            const name     = document.querySelector("h1")?.innerText?.trim() || "";
            const tagline  = document.querySelector(".org-top-card-summary__tagline, .top-card-layout__headline")?.innerText?.trim() || "";
            const about    = document.querySelector(".core-section-container__content p, .org-about-us-organization-description__text")?.innerText?.trim() || "";
            const details  = [...document.querySelectorAll(".org-about-company-module__company-size-definition-text, dl.overflow-hidden dt, dl.overflow-hidden dd")]
                              .map(e => e.innerText.trim());
            const followers= document.querySelector(".org-top-card-summary__follower-count, .social-proof-text")?.innerText?.trim() || "";
            return {{name, tagline, about, followers, details}};
        }}''')
        print(json.dumps({{"ok": True, "info": info}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "LinkedIn company scrape failed"))
    return r.get("info", {})


# ══════════════════════════════════════════════════════════════════════════════
# TIKTOK
# ══════════════════════════════════════════════════════════════════════════════

def tiktok_profile(username: str, timeout: int = 60) -> dict:
    """Scrape a public TikTok profile.
    Returns {username, display_name, bio, followers, following, likes, video_count}."""
    username = username.lstrip("@")
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://www.tiktok.com/@{username}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(4000)
        info = page.evaluate('''() => {{
            const name = document.querySelector("h1[data-e2e=\\'user-title\\']")?.innerText?.trim()
                      || document.querySelector("h1")?.innerText?.trim() || "";
            const bio  = document.querySelector("[data-e2e=\\'user-bio\\']")?.innerText?.trim() || "";
            const counts = [...document.querySelectorAll("[data-e2e$=\\'-count\\']")].map(e => e.innerText.trim());
            return {{name, bio, counts}};
        }}''')
        counts = info.get("counts", [])
        print(json.dumps({{"ok": True, "info": {{
            "username": "{username}",
            "display_name": info.get("name",""),
            "bio": info.get("bio",""),
            "following":  counts[0] if len(counts)>0 else "",
            "followers":  counts[1] if len(counts)>1 else "",
            "likes":      counts[2] if len(counts)>2 else "",
        }}}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "TikTok profile scrape failed"))
    return r.get("info", {})


def tiktok_search(query: str, limit: int = 20, timeout: int = 60) -> list:
    """Search TikTok for videos. Returns list of {title, author, url, likes, plays}."""
    import urllib.parse
    q = urllib.parse.quote(query)
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://www.tiktok.com/search?q={q}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(4000)
        {_scroll_load("page", times=4, pause=1500)}
        results = page.evaluate('''() => {{
            const cards = [...document.querySelectorAll("[data-e2e=\\'search_top-item\\'], .tiktok-x6f6za-DivItemContainerV2")];
            return cards.slice(0, {limit}).map(c => ({{
                title:  c.querySelector("[data-e2e=\\'search-card-desc\\'], .tiktok-j2a19z-SpanText")?.innerText?.trim() || "",
                author: c.querySelector("[data-e2e=\\'search-card-user-unique-id\\']")?.innerText?.trim() || "",
                url:    c.querySelector("a")?.href || "",
                likes:  c.querySelector("[data-e2e=\\'search-card-like-count\\']")?.innerText?.trim() || "",
                plays:  c.querySelector("[data-e2e=\\'video-views\\']")?.innerText?.trim() || "",
            }})).filter(v => v.title || v.url);
        }}''')
        print(json.dumps({{"ok": True, "results": results}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "TikTok search failed"))
    return r.get("results", [])


def tiktok_hashtag(hashtag: str, limit: int = 20, timeout: int = 60) -> list:
    """Scrape TikTok videos by hashtag. Returns list of {title, author, url, plays}."""
    hashtag = hashtag.lstrip("#")
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://www.tiktok.com/tag/{hashtag}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(4000)
        {_scroll_load("page", times=4, pause=1500)}
        videos = page.evaluate('''() => {{
            const items = [...document.querySelectorAll("[data-e2e=\\'challenge-item\\'], .tiktok-x6f6za-DivItemContainerV2")];
            return items.slice(0, {limit}).map(el => ({{
                title:  el.querySelector("p, .video-meta-title")?.innerText?.trim() || "",
                author: el.querySelector(".author-name")?.innerText?.trim() || "",
                url:    el.querySelector("a")?.href || "",
                plays:  el.querySelector("[data-e2e=\\'video-views\\']")?.innerText?.trim() || "",
            }})).filter(v => v.url);
        }}''')
        print(json.dumps({{"ok": True, "videos": videos}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "TikTok hashtag scrape failed"))
    return r.get("videos", [])


# ══════════════════════════════════════════════════════════════════════════════
# FACEBOOK (public pages only)
# ══════════════════════════════════════════════════════════════════════════════

def facebook_page(page_name: str, timeout: int = 60) -> dict:
    """Scrape a public Facebook page (no login).
    Returns {name, about, likes, follows, category, website}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://www.facebook.com/{page_name}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(4000)
        info = page.evaluate('''() => {{
            const name  = document.querySelector("h1")?.innerText?.trim() || document.title || "";
            const about = document.querySelector("[data-key=\\'intro_card.short_description\\'] span")?.innerText?.trim() || "";
            const spans = [...document.querySelectorAll("span")].map(s => s.innerText.trim());
            const likes_idx = spans.findIndex(s => s.includes("people like this"));
            const likes = likes_idx > 0 ? spans[likes_idx-1] : "";
            const follows_idx = spans.findIndex(s => s.includes("people follow this"));
            const follows = follows_idx > 0 ? spans[follows_idx-1] : "";
            return {{name, about, likes, follows}};
        }}''')
        print(json.dumps({{"ok": True, "info": info}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Facebook page scrape failed"))
    return r.get("info", {})


# ══════════════════════════════════════════════════════════════════════════════
# PINTEREST
# ══════════════════════════════════════════════════════════════════════════════

def pinterest_search(query: str, limit: int = 30, timeout: int = 60) -> list:
    """Search Pinterest for pins. Returns list of {title, description, url, image}."""
    import urllib.parse
    q = urllib.parse.quote(query)
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://www.pinterest.com/search/pins/?q={q}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(4000)
        {_scroll_load("page", times=5, pause=1500)}
        pins = page.evaluate('''() => {{
            const items = [...document.querySelectorAll("[data-test-id=\\'pin\\']")];
            return items.slice(0, {limit}).map(el => ({{
                title:       el.querySelector("[data-test-id=\\'pin-draft-title\\'], h3")?.innerText?.trim() || "",
                description: el.querySelector("[data-test-id=\\'pin-draft-description\\']")?.innerText?.trim() || "",
                url:         el.querySelector("a")?.href || "",
                image:       el.querySelector("img")?.src || "",
            }})).filter(p => p.url);
        }}''')
        print(json.dumps({{"ok": True, "pins": pins}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Pinterest search failed"))
    return r.get("pins", [])


def pinterest_profile(username: str, timeout: int = 60) -> dict:
    """Scrape a public Pinterest profile.
    Returns {name, bio, followers, following, monthly_viewers, pin_count}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://www.pinterest.com/{username}/", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        info = page.evaluate('''() => {{
            const name = document.querySelector("h1")?.innerText?.trim() || "";
            const bio  = document.querySelector("[data-test-id=\\'profile-about-section-text\\']")?.innerText?.trim() || "";
            const counts = [...document.querySelectorAll("[data-test-id=\\'profile-follower-count\\'], .tBJ.dyH.iFc.MF7.pBj.DrD.IZT")].map(e => e.innerText.trim());
            return {{name, bio, counts}};
        }}''')
        counts = info.get("counts", [])
        print(json.dumps({{"ok": True, "info": {{
            "name": info.get("name",""),
            "bio":  info.get("bio",""),
            "followers": counts[0] if counts else "",
            "following": counts[1] if len(counts)>1 else "",
        }}}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Pinterest profile scrape failed"))
    return r.get("info", {})


# ══════════════════════════════════════════════════════════════════════════════
# TELEGRAM (public channels)
# ══════════════════════════════════════════════════════════════════════════════

def telegram_channel(channel: str, limit: int = 30, timeout: int = 60) -> list:
    """Scrape public Telegram channel messages via t.me/s/.
    Returns list of {text, date, views, url}."""
    channel = channel.lstrip("@")
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://t.me/s/{channel}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        {_scroll_load("page", times=4, pause=1200)}
        messages = page.evaluate('''() => {{
            const msgs = [...document.querySelectorAll(".tgme_widget_message")];
            return msgs.slice(-{limit}).map(m => ({{
                text:  m.querySelector(".tgme_widget_message_text")?.innerText?.trim() || "",
                date:  m.querySelector("time")?.getAttribute("datetime") || "",
                views: m.querySelector(".tgme_widget_message_views")?.innerText?.trim() || "",
                url:   m.querySelector(".tgme_widget_message_date a")?.href || "",
            }}));
        }}''')
        print(json.dumps({{"ok": True, "messages": messages}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Telegram channel scrape failed"))
    return r.get("messages", [])


def telegram_channel_info(channel: str, timeout: int = 45) -> dict:
    """Get Telegram public channel info.
    Returns {name, description, subscribers, url}."""
    channel = channel.lstrip("@")
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://t.me/s/{channel}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)
        info = page.evaluate('''() => {{
            const name = document.querySelector(".tgme_channel_info_header_title")?.innerText?.trim() || "";
            const desc = document.querySelector(".tgme_channel_info_description")?.innerText?.trim() || "";
            const subs = document.querySelector(".tgme_channel_info_counter .counter_value")?.innerText?.trim() || "";
            return {{name, description: desc, subscribers: subs}};
        }}''')
        info["url"] = f"https://t.me/{channel}"
        print(json.dumps({{"ok": True, "info": info}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Telegram info scrape failed"))
    return r.get("info", {})


# ══════════════════════════════════════════════════════════════════════════════
# MEDIUM
# ══════════════════════════════════════════════════════════════════════════════

def medium_search(query: str, limit: int = 20, timeout: int = 60) -> list:
    """Search Medium for articles. Returns list of {title, author, url, date, reading_time, claps}."""
    import urllib.parse
    q = urllib.parse.quote(query)
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://medium.com/search?q={q}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        {_scroll_load("page", times=4, pause=1200)}
        articles = page.evaluate('''() => {{
            const cards = [...document.querySelectorAll("article")];
            return cards.slice(0, {limit}).map(a => ({{
                title:   a.querySelector("h2, h3")?.innerText?.trim() || "",
                author:  a.querySelector("p a, .ds-link")?.innerText?.trim() || "",
                url:     a.querySelector("a[data-action=\\'open-post\\'], h2 a, h3 a")?.href || a.querySelector("a")?.href || "",
                date:    a.querySelector("span[data-testid=\\'storyPublishDate\\']")?.innerText?.trim() || "",
                reading_time: a.querySelector("span[data-testid=\\'storyReadTime\\']")?.innerText?.trim() || "",
            }})).filter(a => a.title);
        }}''')
        print(json.dumps({{"ok": True, "articles": articles}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Medium search failed"))
    return r.get("articles", [])


def medium_article(url: str, timeout: int = 45) -> dict:
    """Scrape a Medium article.
    Returns {title, author, date, reading_time, content, tags, claps}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        data = page.evaluate('''() => {{
            const title  = document.querySelector("h1")?.innerText?.trim() || "";
            const author = document.querySelector("[data-testid=\\'authorName\\']")?.innerText?.trim() || "";
            const date   = document.querySelector("[data-testid=\\'storyPublishDate\\']")?.innerText?.trim() || "";
            const rt     = document.querySelector("[data-testid=\\'storyReadTime\\']")?.innerText?.trim() || "";
            const paras  = [...document.querySelectorAll("article p")].map(p => p.innerText.trim()).filter(Boolean);
            const tags   = [...document.querySelectorAll("a[href*=\\'tag/\\']")].map(a => a.innerText.trim()).filter(Boolean);
            const claps  = document.querySelector("[data-testid=\\'clapCount\\']")?.innerText?.trim() || "";
            return {{title, author, date, reading_time: rt, content: paras.join("\\n"), tags, claps}};
        }}''')
        print(json.dumps({{"ok": True, "data": data}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Medium article scrape failed"))
    return r.get("data", {})


def medium_publication(pub_url: str, limit: int = 20, timeout: int = 60) -> list:
    """Scrape articles from a Medium publication.
    Returns list of {title, author, url, date, reading_time}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto({json.dumps(pub_url)}, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        {_scroll_load("page", times=4, pause=1200)}
        articles = page.evaluate('''() => {{
            const cards = [...document.querySelectorAll("article, .postArticle")];
            return cards.slice(0, {limit}).map(a => ({{
                title:   a.querySelector("h1, h2, h3")?.innerText?.trim() || "",
                author:  a.querySelector("[rel=\\'author\\']")?.innerText?.trim() || "",
                url:     a.querySelector("a[href*=\\'/p/\\'], h1 a, h2 a, h3 a")?.href || "",
                date:    a.querySelector("time")?.getAttribute("datetime") || a.querySelector("time")?.innerText || "",
                reading_time: a.querySelector("[data-testid=\\'storyReadTime\\']")?.innerText?.trim() || "",
            }})).filter(a => a.title);
        }}''')
        print(json.dumps({{"ok": True, "articles": articles}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Medium publication scrape failed"))
    return r.get("articles", [])


# ══════════════════════════════════════════════════════════════════════════════
# QUORA
# ══════════════════════════════════════════════════════════════════════════════

def quora_search(query: str, limit: int = 15, timeout: int = 60) -> list:
    """Search Quora for questions/answers. Returns list of {question, url, answer_snippet, author}."""
    import urllib.parse
    q = urllib.parse.quote(query)
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://www.quora.com/search?q={q}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(4000)
        {_scroll_load("page", times=3, pause=1500)}
        results = page.evaluate('''() => {{
            const cards = [...document.querySelectorAll(".q-box.qu-pt--medium")];
            return cards.slice(0, {limit}).map(c => ({{
                question: c.querySelector(".q-text")?.innerText?.trim() || c.querySelector("span.q-text")?.innerText?.trim() || "",
                url:      c.querySelector("a.q-box")?.href || "",
                answer:   c.querySelector(".q-relative span.q-text")?.innerText?.trim() || "",
            }})).filter(r => r.question || r.url);
        }}''')
        print(json.dumps({{"ok": True, "results": results}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Quora search failed"))
    return r.get("results", [])


def quora_question(url: str, limit: int = 10, timeout: int = 60) -> dict:
    """Scrape a Quora question and its top answers.
    Returns {question, answers: [{author, text, upvotes}]}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(4000)
        {_scroll_load("page", times=4, pause=1500)}
        data = page.evaluate('''() => {{
            const question = document.querySelector("h1 span.q-text, .q-text.qu-dynamicFontSize--regular_title")?.innerText?.trim() || document.querySelector("h1")?.innerText?.trim() || "";
            const cards = [...document.querySelectorAll(".q-box.qu-borderBottom--thin")];
            const answers = cards.slice(0, {limit}).map(c => ({{
                author:  c.querySelector(".q-text.qu-semiBold")?.innerText?.trim() || "",
                text:    c.querySelector(".q-box.qu-mb--small span.q-text")?.innerText?.trim() || "",
                upvotes: c.querySelector("[class*=\\'upvote\\'] .q-text")?.innerText?.trim() || "",
            }})).filter(a => a.text);
            return {{question, answers}};
        }}''')
        print(json.dumps({{"ok": True, "data": data}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Quora question scrape failed"))
    return r.get("data", {})


# ══════════════════════════════════════════════════════════════════════════════
# GITHUB (social/discovery layer)
# ══════════════════════════════════════════════════════════════════════════════

def github_trending(language: str = "", period: str = "daily", timeout: int = 45) -> list:
    """Scrape GitHub trending repositories.
    period = daily|weekly|monthly. Returns list of {name, url, description, stars, forks, language}."""
    lang_slug = language.lower().replace(" ", "-").replace("#", "sharp").replace("+", "p") if language else ""
    url = f"https://github.com/trending/{lang_slug}?since={period}"
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)
        repos = page.evaluate('''() => {{
            const rows = [...document.querySelectorAll("article.Box-row")];
            return rows.map(r => ({{
                name:        r.querySelector("h2 a")?.innerText?.replace(/\\s+/g," ")?.trim() || "",
                url:         "https://github.com" + (r.querySelector("h2 a")?.getAttribute("href") || ""),
                description: r.querySelector("p")?.innerText?.trim() || "",
                stars:       r.querySelector("[href$=\\'stargazers\\']")?.innerText?.trim() || "",
                forks:       r.querySelector("[href$=\\'forks\\']")?.innerText?.trim() || "",
                language:    r.querySelector("[itemprop=\\'programmingLanguage\\']")?.innerText?.trim() || "",
                today_stars: r.querySelector(".d-inline-block.float-sm-right")?.innerText?.trim() || "",
            }}));
        }}''')
        print(json.dumps({{"ok": True, "repos": repos}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "GitHub trending scrape failed"))
    return r.get("repos", [])


def github_profile(username: str, timeout: int = 45) -> dict:
    """Scrape a GitHub user profile.
    Returns {name, bio, location, company, website, followers, following, repos}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://github.com/{username}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)
        info = page.evaluate('''() => {{
            const name      = document.querySelector(".p-name")?.innerText?.trim() || "";
            const bio       = document.querySelector(".p-note")?.innerText?.trim() || "";
            const company   = document.querySelector(".p-org")?.innerText?.trim() || "";
            const location  = document.querySelector(".p-label")?.innerText?.trim() || "";
            const website   = document.querySelector("[itemprop=\\'url\\'] a")?.href || "";
            const followers = document.querySelector(".js-profile-editable-followers a .text-bold")?.innerText?.trim() || "";
            const following = document.querySelectorAll(".js-profile-editable-followers a")[1]?.querySelector(".text-bold")?.innerText?.trim() || "";
            const repos     = document.querySelector("#js-pjax-container .Counter")?.innerText?.trim() || "";
            return {{name, bio, company, location, website, followers, following, repos}};
        }}''')
        print(json.dumps({{"ok": True, "info": info}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "GitHub profile scrape failed"))
    return r.get("info", {})


def github_repo_issues(repo: str, state: str = "open", limit: int = 25, timeout: int = 45) -> list:
    """Scrape issues from a GitHub repository.
    repo = 'owner/repo'. Returns list of {title, url, author, labels, date, comments}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://github.com/{repo}/issues?state={state}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)
        issues = page.evaluate('''() => {{
            const rows = [...document.querySelectorAll(".js-issue-row")];
            return rows.slice(0, {limit}).map(r => ({{
                title:    r.querySelector(".js-issue-title")?.innerText?.trim() || "",
                url:      "https://github.com" + (r.querySelector("a.js-issue-title")?.getAttribute("href") || ""),
                author:   r.querySelector(".opened-by a")?.innerText?.trim() || "",
                labels:   [...r.querySelectorAll(".IssueLabel")].map(l => l.innerText.trim()),
                date:     r.querySelector("relative-time")?.getAttribute("datetime") || "",
                comments: r.querySelector(".comment-count")?.innerText?.trim() || "0",
            }})).filter(i => i.title);
        }}''')
        print(json.dumps({{"ok": True, "issues": issues}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "GitHub issues scrape failed"))
    return r.get("issues", [])


# ══════════════════════════════════════════════════════════════════════════════
# THREADS (Meta)
# ══════════════════════════════════════════════════════════════════════════════

def threads_profile(username: str, timeout: int = 60) -> dict:
    """Scrape a public Threads profile.
    Returns {username, name, bio, followers}."""
    username = username.lstrip("@")
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://www.threads.net/@{username}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(4000)
        info = page.evaluate('''() => {{
            const name = document.querySelector("h1")?.innerText?.trim() || "";
            const bio  = document.querySelector("div[dir] span")?.innerText?.trim() || "";
            const spans = [...document.querySelectorAll("span")].map(s => s.innerText.trim());
            const f_idx = spans.findIndex(s => s.toLowerCase().includes("follower"));
            const followers = f_idx > 0 ? spans[f_idx-1] : "";
            return {{name, bio, followers}};
        }}''')
        info["username"] = username
        print(json.dumps({{"ok": True, "info": info}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Threads profile scrape failed"))
    return r.get("info", {})


# ══════════════════════════════════════════════════════════════════════════════
# MASTODON (federated, public)
# ══════════════════════════════════════════════════════════════════════════════

def mastodon_profile(instance: str, username: str, timeout: int = 45) -> dict:
    """Scrape a public Mastodon profile.
    instance = 'mastodon.social'. Returns {name, bio, followers, following, posts}."""
    username = username.lstrip("@")
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://{instance}/@{username}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)
        info = page.evaluate('''() => {{
            const name = document.querySelector(".account__header__name h1 span")?.innerText?.trim()
                      || document.querySelector("h1")?.innerText?.trim() || "";
            const bio  = document.querySelector(".account__header__content")?.innerText?.trim() || "";
            const counters = [...document.querySelectorAll(".account__header__extra__links a")].map(a => ({{
                label: a.querySelector("span:first-child")?.innerText?.trim() || "",
                count: a.querySelector(".js-counter, .animated-number")?.innerText?.trim() || "",
            }}));
            return {{name, bio, counters}};
        }}''')
        counters = {{c["label"].lower(): c["count"] for c in info.get("counters", [])}}
        print(json.dumps({{"ok": True, "info": {{
            "name": info.get("name",""),
            "bio":  info.get("bio",""),
            "posts":     counters.get("posts",""),
            "following": counters.get("following",""),
            "followers": counters.get("followers",""),
        }}}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Mastodon profile scrape failed"))
    return r.get("info", {})


def mastodon_public_timeline(instance: str, limit: int = 20, timeout: int = 45) -> list:
    """Scrape the public timeline of a Mastodon instance.
    Returns list of {author, text, date, url, boosts, favourites}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto(f"https://{instance}/public", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)
        {_scroll_load("page", times=3, pause=1200)}
        posts = page.evaluate('''() => {{
            const items = [...document.querySelectorAll(".status__wrapper, .entry")];
            return items.slice(0, {limit}).map(el => ({{
                author: el.querySelector(".display-name strong")?.innerText?.trim() || "",
                text:   el.querySelector(".status__content p")?.innerText?.trim() || "",
                date:   el.querySelector("time")?.getAttribute("datetime") || "",
                url:    el.querySelector("a.status__relative-time")?.href || "",
            }})).filter(p => p.text);
        }}''')
        print(json.dumps({{"ok": True, "posts": posts}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Mastodon timeline scrape failed"))
    return r.get("posts", [])


# ══════════════════════════════════════════════════════════════════════════════
# HACKER NEWS
# ══════════════════════════════════════════════════════════════════════════════

def hackernews_top(limit: int = 30, timeout: int = 45) -> list:
    """Scrape top stories from Hacker News.
    Returns list of {rank, title, url, points, author, comments, age}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto("https://news.ycombinator.com/", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1500)
        stories = page.evaluate('''() => {{
            const rows = [...document.querySelectorAll("tr.athing")];
            return rows.slice(0, {limit}).map(r => {{
                const next = r.nextElementSibling;
                return {{
                    rank:     r.querySelector(".rank")?.innerText?.replace(".","")?.trim() || "",
                    title:    r.querySelector(".titleline a")?.innerText?.trim() || "",
                    url:      r.querySelector(".titleline a")?.href || "",
                    points:   next?.querySelector(".score")?.innerText?.trim() || "",
                    author:   next?.querySelector(".hnuser")?.innerText?.trim() || "",
                    comments: next?.querySelector("a:last-of-type")?.innerText?.trim() || "",
                    age:      next?.querySelector(".age a")?.innerText?.trim() || "",
                }};
            }}).filter(s => s.title);
        }}''')
        print(json.dumps({{"ok": True, "stories": stories}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Hacker News scrape failed"))
    return r.get("stories", [])


def hackernews_comments(post_url: str, limit: int = 30, timeout: int = 45) -> list:
    """Scrape comments from a HN post.
    Returns list of {author, text, age, indent_level}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto({json.dumps(post_url)}, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1500)
        comments = page.evaluate('''() => {{
            const rows = [...document.querySelectorAll("tr.athing.comtr")];
            return rows.slice(0, {limit}).map(r => ({{
                author: r.querySelector(".hnuser")?.innerText?.trim() || "",
                text:   r.querySelector(".commtext")?.innerText?.trim() || "",
                age:    r.querySelector(".age a")?.innerText?.trim() || "",
                indent: parseInt(r.querySelector("td.ind img")?.getAttribute("width") || "0"),
            }})).filter(c => c.text);
        }}''')
        print(json.dumps({{"ok": True, "comments": comments}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "HN comments scrape failed"))
    return r.get("comments", [])


# ══════════════════════════════════════════════════════════════════════════════
# PRODUCT HUNT
# ══════════════════════════════════════════════════════════════════════════════

def producthunt_today(limit: int = 20, timeout: int = 45) -> list:
    """Scrape today's top products from Product Hunt.
    Returns list of {name, tagline, url, votes, comments, topics}."""
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto("https://www.producthunt.com/", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        products = page.evaluate('''() => {{
            const cards = [...document.querySelectorAll("[data-test=\\'homepage-section\\'] li, .styles_item__Xkv3Q")];
            return cards.slice(0, {limit}).map(c => ({{
                name:    c.querySelector("h3, strong")?.innerText?.trim() || "",
                tagline: c.querySelector("p[class*=\\'tagline\\'], .tagline")?.innerText?.trim() || "",
                url:     c.querySelector("a")?.href || "",
                votes:   c.querySelector("[data-vote-count], button span")?.innerText?.trim() || "",
            }})).filter(p => p.name);
        }}''')
        print(json.dumps({{"ok": True, "products": products}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "Product Hunt scrape failed"))
    return r.get("products", [])


# ══════════════════════════════════════════════════════════════════════════════
# DEVTO
# ══════════════════════════════════════════════════════════════════════════════

def devto_feed(tag: str = "", limit: int = 20, timeout: int = 45) -> list:
    """Scrape DEV.to articles, optionally by tag.
    Returns list of {title, author, url, tags, reactions, comments, date}."""
    url = f"https://dev.to/t/{tag.lstrip('#')}" if tag else "https://dev.to/"
    script = f"""
with sync_playwright() as pw:
    browser, page = new_page(pw)
    try:
        page.goto({json.dumps(url)}, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)
        {_scroll_load("page", times=3, pause=1000)}
        articles = page.evaluate('''() => {{
            const cards = [...document.querySelectorAll(".crayons-story, article.crayons-article")];
            return cards.slice(0, {limit}).map(c => ({{
                title:    c.querySelector(".crayons-story__title a, h2 a, h3 a")?.innerText?.trim() || "",
                author:   c.querySelector(".crayons-story__secondary .profile-preview-card__trigger")?.innerText?.trim() || "",
                url:      c.querySelector(".crayons-story__title a")?.href || "",
                tags:     [...c.querySelectorAll(".crayons-tag")].map(t => t.innerText.trim()),
                reactions:c.querySelector(".crayons-story__reactions button span")?.innerText?.trim() || "",
                comments: c.querySelector(".crayons-story__comments")?.innerText?.trim() || "",
                date:     c.querySelector("time")?.getAttribute("datetime") || "",
            }})).filter(a => a.title);
        }}''')
        print(json.dumps({{"ok": True, "articles": articles}}))
    except Exception as e:
        print(json.dumps({{"ok": False, "error": str(e)}}))
    finally:
        browser.close()
"""
    r = _run(script, timeout)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", "DEV.to scrape failed"))
    return r.get("articles", [])


# ══════════════════════════════════════════════════════════════════════════════
# CONVENIENCE: multi-platform search
# ══════════════════════════════════════════════════════════════════════════════

def search_all(query: str, platforms: list = None, limit_each: int = 10) -> dict:
    """Search multiple platforms at once (sequentially to avoid memory issues).
    platforms = list of platform names to search. Defaults to [twitter, reddit, youtube, hackernews].
    Returns dict keyed by platform name.

    Example:
        results = search_all("AI agents", platforms=["twitter", "reddit", "youtube"])
    """
    if platforms is None:
        platforms = ["twitter", "reddit", "youtube", "hackernews"]

    dispatch = {
        "twitter":     lambda q: twitter_search(q, limit=limit_each),
        "reddit":      lambda q: reddit_search(q, limit=limit_each),
        "youtube":     lambda q: youtube_search(q, limit=limit_each),
        "hackernews":  lambda q: hackernews_top(limit=limit_each),
        "medium":      lambda q: medium_search(q, limit=limit_each),
        "devto":       lambda q: devto_feed(q, limit=limit_each),
        "pinterest":   lambda q: pinterest_search(q, limit=limit_each),
        "tiktok":      lambda q: tiktok_search(q, limit=limit_each),
        "quora":       lambda q: quora_search(q, limit=limit_each),
        "github":      lambda q: github_trending(),
    }

    results = {}
    for platform in platforms:
        fn = dispatch.get(platform.lower())
        if fn is None:
            results[platform] = {"error": f"Unknown platform: {platform}"}
            continue
        try:
            results[platform] = fn(query)
        except Exception as e:
            results[platform] = {"error": str(e)}
    return results
