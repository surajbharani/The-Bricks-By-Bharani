"""CSV utilities — read, write, filter, summarize. No dependencies."""
import csv
import json
from pathlib import Path


def read(path, encoding="utf-8"):
    """Read CSV file → list of dicts (header row becomes keys)."""
    with open(path, newline="", encoding=encoding, errors="replace") as f:
        return list(csv.DictReader(f))


def write(path, rows, fieldnames=None):
    """Write list of dicts → CSV file."""
    if not rows:
        return
    fields = fieldnames or list(rows[0].keys())
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def filter_rows(rows, **kwargs):
    """Return rows where all given key=value conditions match.
    Example: filter_rows(rows, status="active", country="IN")"""
    return [r for r in rows if all(str(r.get(k, "")) == str(v) for k, v in kwargs.items())]


def search_rows(rows, query, columns=None):
    """Case-insensitive substring search across specified columns (or all)."""
    q = query.lower()
    return [
        r for r in rows
        if any(q in str(v).lower() for k, v in r.items() if not columns or k in columns)
    ]


def to_json(path_or_rows, output=None, indent=2):
    """Convert CSV path (or list of dicts) to JSON string; optionally write to output path."""
    rows = read(path_or_rows) if isinstance(path_or_rows, (str, Path)) else path_or_rows
    out = json.dumps(rows, indent=indent, ensure_ascii=False)
    if output:
        Path(output).write_text(out, encoding="utf-8")
    return out


def summarize(path):
    """Return row count, column names, and numeric stats for each numeric column."""
    rows = read(path)
    if not rows:
        return {"rows": 0, "columns": []}
    numeric = {}
    for col in rows[0]:
        vals = []
        for r in rows:
            try:
                vals.append(float(r[col]))
            except (ValueError, TypeError):
                pass
        if vals:
            numeric[col] = {
                "min": min(vals), "max": max(vals),
                "mean": sum(vals) / len(vals), "count": len(vals),
            }
    return {"rows": len(rows), "columns": list(rows[0].keys()), "numeric": numeric}


def group_by(rows, key):
    """Group list of dicts by a column value → {value: [rows]}."""
    groups = {}
    for r in rows:
        k = r.get(key, "")
        groups.setdefault(k, []).append(r)
    return groups


def column_values(rows, key, unique=False):
    """Extract all values of one column. unique=True → deduplicated list."""
    vals = [r.get(key) for r in rows]
    return list(dict.fromkeys(vals)) if unique else vals
