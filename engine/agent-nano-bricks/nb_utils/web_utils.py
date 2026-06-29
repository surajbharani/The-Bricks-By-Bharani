"""HTTP/web utilities using stdlib urllib — no extra dependencies."""
import json
import urllib.error
import urllib.parse
import urllib.request

_UA = "Mozilla/5.0 (NanoBricks-Agent/1.0; compatible)"


def get(url, headers=None, timeout=20, max_bytes=524288):
    """GET a URL and return the response body as text."""
    req = urllib.request.Request(url, headers={"User-Agent": _UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read(max_bytes)
        ct = r.headers.get("Content-Type", "")
        charset = "utf-8"
        if "charset=" in ct:
            charset = ct.split("charset=")[-1].split(";")[0].strip()
        try:
            return raw.decode(charset, errors="replace")
        except LookupError:
            return raw.decode("utf-8", errors="replace")


def get_json(url, headers=None, timeout=20):
    """GET a URL and parse the response as JSON."""
    return json.loads(get(url, headers=headers, timeout=timeout))


def post(url, data, headers=None, timeout=20):
    """POST raw bytes/str to a URL, return response text."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    h = {"User-Agent": _UA, **(headers or {})}
    req = urllib.request.Request(url, data=data, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def post_json(url, payload, headers=None, timeout=20):
    """POST a JSON payload and return the parsed JSON response."""
    body = json.dumps(payload).encode("utf-8")
    h = {"Content-Type": "application/json", "User-Agent": _UA, **(headers or {})}
    req = urllib.request.Request(url, data=body, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def download_file(url, save_path, timeout=60):
    """Download a binary file from url to save_path. Returns bytes written."""
    import pathlib
    pathlib.Path(save_path).parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    pathlib.Path(save_path).write_bytes(data)
    return len(data)


def safe_get(url, default=None, **kwargs):
    """GET with no exception — returns default on any error."""
    try:
        return get(url, **kwargs)
    except Exception:
        return default


def safe_get_json(url, default=None, **kwargs):
    """GET JSON with no exception — returns default on any error."""
    try:
        return get_json(url, **kwargs)
    except Exception:
        return default


def build_url(base, **params):
    """Build a URL with query parameters: build_url("https://example.com", q="hello")."""
    return base + "?" + urllib.parse.urlencode(params) if params else base


def url_encode(text):
    """Percent-encode a string for use in a URL path or query value."""
    return urllib.parse.quote(str(text))
