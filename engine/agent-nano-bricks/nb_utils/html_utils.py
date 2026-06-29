"""HTML parsing utilities using stdlib html.parser — no BeautifulSoup needed."""
import re
import urllib.parse
from html.parser import HTMLParser


# ── Low-level parser helpers ──────────────────────────────────────────────────

class _TextExtractor(HTMLParser):
    _SKIP = {"script", "style", "noscript", "head", "meta", "link"}

    def __init__(self):
        super().__init__()
        self._skip = False
        self._parts = []

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP:
            self._skip = True

    def handle_endtag(self, tag):
        if tag in self._SKIP:
            self._skip = False
        if tag in ("p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"):
            self._parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self._parts.append(data)

    def text(self):
        return re.sub(r"\n{3,}", "\n\n", "".join(self._parts)).strip()


# ── Public API ────────────────────────────────────────────────────────────────

def get_text(html):
    """Strip all HTML tags and return clean plain text."""
    p = _TextExtractor()
    p.feed(html or "")
    return p.text()


def get_links(html, base_url=""):
    """Extract all <a href> links. Returns list of absolute URL strings."""
    links = re.findall(r'<a[^>]+href=["\']([^"\']+)["\']', html or "", re.IGNORECASE)
    if base_url:
        links = [urllib.parse.urljoin(base_url, l) for l in links]
    return [l for l in links if l.startswith("http")]


def get_images(html, base_url=""):
    """Extract all <img src> URLs."""
    srcs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html or "", re.IGNORECASE)
    if base_url:
        srcs = [urllib.parse.urljoin(base_url, s) for s in srcs]
    return srcs


def get_headings(html):
    """Extract headings (h1–h6). Returns list of {level, text} dicts."""
    headings = []
    for m in re.finditer(r"<h([1-6])[^>]*>(.*?)</h\1>", html or "", re.IGNORECASE | re.DOTALL):
        text = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        headings.append({"level": int(m.group(1)), "text": text})
    return headings


def get_tables(html):
    """Parse all <table> elements into list-of-rows-of-cells (strings).
    Returns: list[list[list[str]]] — tables → rows → cells."""
    tables = []
    for tbl in re.finditer(r"<table[^>]*>(.*?)</table>", html or "", re.IGNORECASE | re.DOTALL):
        rows = []
        for row in re.finditer(r"<tr[^>]*>(.*?)</tr>", tbl.group(1), re.IGNORECASE | re.DOTALL):
            cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row.group(1), re.IGNORECASE | re.DOTALL)
            cells = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
            rows.append(cells)
        if rows:
            tables.append(rows)
    return tables


def get_table_as_dicts(html, table_index=0):
    """Parse first (or nth) HTML table into list of dicts using the header row as keys."""
    tables = get_tables(html)
    if not tables or table_index >= len(tables):
        return []
    rows = tables[table_index]
    if len(rows) < 2:
        return []
    headers = rows[0]
    return [dict(zip(headers, row)) for row in rows[1:]]


def get_meta(html):
    """Extract <meta name content> and <meta property content> tags → dict."""
    meta = {}
    for m in re.finditer(r'<meta\s+(?:name|property)=["\']([^"\']+)["\'][^>]+content=["\']([^"\']*)["\']',
                         html or "", re.IGNORECASE):
        meta[m.group(1)] = m.group(2)
    for m in re.finditer(r'<meta\s+content=["\']([^"\']*)["\'][^>]+(?:name|property)=["\']([^"\']+)["\']',
                         html or "", re.IGNORECASE):
        meta[m.group(2)] = m.group(1)
    return meta


def get_element_text(html, tag, attrs_filter=None):
    """Get text content of all matching elements.
    attrs_filter: dict like {"class": "title"} to filter by attribute."""
    pattern = rf"<{tag}([^>]*)>(.*?)</{tag}>"
    results = []
    for m in re.finditer(pattern, html or "", re.IGNORECASE | re.DOTALL):
        attr_str = m.group(1)
        if attrs_filter:
            if not all(f'{k}="{v}"' in attr_str or f"{k}='{v}'" in attr_str
                       for k, v in attrs_filter.items()):
                continue
        results.append(re.sub(r"<[^>]+>", "", m.group(2)).strip())
    return results
