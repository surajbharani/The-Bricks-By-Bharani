"""JSON utilities — load, save, merge, flatten, query. No dependencies."""
import json
from pathlib import Path


def load(path):
    """Load JSON from a file path."""
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save(path, data, indent=2):
    """Save data as pretty JSON to a file path."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, indent=indent, ensure_ascii=False), encoding="utf-8")


def pretty(data, indent=2):
    """Return a pretty-printed JSON string."""
    return json.dumps(data, indent=indent, ensure_ascii=False)


def merge(*dicts):
    """Shallow-merge multiple dicts. Later values overwrite earlier ones."""
    out = {}
    for d in dicts:
        out.update(d)
    return out


def deep_merge(base, override):
    """Recursively merge override into base (dicts merged, other values overwritten)."""
    result = dict(base)
    for k, v in override.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def flatten(d, prefix="", sep="."):
    """Flatten a nested dict: {"a": {"b": 1}} → {"a.b": 1}."""
    items = {}
    for k, v in d.items():
        key = f"{prefix}{sep}{k}" if prefix else k
        if isinstance(v, dict):
            items.update(flatten(v, key, sep))
        else:
            items[key] = v
    return items


def get_path(data, *keys, default=None):
    """Safely traverse nested keys: get_path(obj, "a", "b", "c") → obj["a"]["b"]["c"]."""
    cur = data
    for k in keys:
        if isinstance(cur, dict):
            cur = cur.get(k, default)
        elif isinstance(cur, list) and isinstance(k, int):
            cur = cur[k] if k < len(cur) else default
        else:
            return default
    return cur


def filter_keys(d, keys):
    """Return a new dict with only the specified keys."""
    return {k: d[k] for k in keys if k in d}


def parse_safe(text, default=None):
    """Parse JSON string, returning default on error instead of raising."""
    try:
        return json.loads(text)
    except Exception:
        return default
