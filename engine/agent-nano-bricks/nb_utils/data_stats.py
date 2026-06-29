"""Numeric statistics — no numpy or pandas required."""


def mean(vals):
    """Arithmetic mean."""
    return sum(vals) / len(vals) if vals else 0.0


def median(vals):
    """Median value."""
    if not vals:
        return 0.0
    s = sorted(vals)
    n = len(s)
    return (s[n // 2 - 1] + s[n // 2]) / 2.0 if n % 2 == 0 else float(s[n // 2])


def mode(vals):
    """Most common value (first one if tie)."""
    if not vals:
        return None
    counts = {}
    for v in vals:
        counts[v] = counts.get(v, 0) + 1
    return max(counts, key=counts.get)


def variance(vals, sample=True):
    """Population (sample=False) or sample (sample=True) variance."""
    if len(vals) < 2:
        return 0.0
    m = mean(vals)
    denom = len(vals) - 1 if sample else len(vals)
    return sum((x - m) ** 2 for x in vals) / denom


def stddev(vals, sample=True):
    """Standard deviation."""
    return variance(vals, sample) ** 0.5


def percentile(vals, p):
    """p-th percentile (0–100). E.g. percentile(vals, 95) → 95th pct."""
    if not vals:
        return 0.0
    s = sorted(vals)
    idx = p / 100.0 * (len(s) - 1)
    lo, hi = int(idx), min(int(idx) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (idx - lo)


def summarize(vals):
    """Full numeric summary dict: count, min, max, mean, median, stddev, p25, p75, p95."""
    if not vals:
        return {}
    return {
        "count": len(vals),
        "min": min(vals),
        "max": max(vals),
        "sum": sum(vals),
        "mean": mean(vals),
        "median": median(vals),
        "stddev": stddev(vals),
        "p25": percentile(vals, 25),
        "p75": percentile(vals, 75),
        "p95": percentile(vals, 95),
    }


def histogram(vals, bins=10):
    """Return a dict of {bin_start: count} for plotting or reporting."""
    if not vals:
        return {}
    lo, hi = min(vals), max(vals)
    if lo == hi:
        return {lo: len(vals)}
    width = (hi - lo) / bins
    counts = {}
    for v in vals:
        b = lo + int((v - lo) / width) * width
        b = round(b, 6)
        counts[b] = counts.get(b, 0) + 1
    return dict(sorted(counts.items()))


def normalize(vals):
    """Min-max normalize a list of numbers to [0, 1]."""
    lo, hi = min(vals), max(vals)
    if lo == hi:
        return [0.0] * len(vals)
    return [(v - lo) / (hi - lo) for v in vals]


def correlation(xs, ys):
    """Pearson correlation coefficient between two equal-length lists."""
    n = len(xs)
    if n < 2 or len(ys) != n:
        return 0.0
    mx, my = mean(xs), mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = (sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)) ** 0.5
    return num / den if den else 0.0
