"""Text processing utilities — search, replace, clean, extract. No dependencies."""
import re


def extract(text, pattern, group=1, flags=0):
    """Return first match of pattern in text (group 1 by default), or None."""
    m = re.search(pattern, text or "", flags)
    return m.group(group) if m else None


def extract_all(text, pattern, group=0, flags=0):
    """Return all non-overlapping matches of pattern."""
    return re.findall(pattern, text or "", flags)


def replace(text, old, new, count=0):
    """String replace; count=0 means replace all."""
    return (text or "").replace(old, new) if not count else (text or "").replace(old, new, count)


def replace_re(text, pattern, replacement, flags=0):
    """Regex substitution."""
    return re.sub(pattern, replacement, text or "", flags=flags)


def clean(text):
    """Collapse multiple whitespace runs into single spaces and strip."""
    return re.sub(r"\s+", " ", (text or "").strip())


def clean_html_tags(text):
    """Strip HTML/XML tags from text."""
    return re.sub(r"<[^>]+>", "", text or "")


def lines(text, skip_empty=True):
    """Split text into lines, optionally skipping blank ones."""
    ls = (text or "").splitlines()
    return [l for l in ls if l.strip()] if skip_empty else ls


def word_count(text):
    """Count words in text."""
    return len((text or "").split())


def char_count(text, exclude_spaces=False):
    """Count characters; exclude_spaces=True ignores whitespace."""
    t = (text or "").replace(" ", "") if exclude_spaces else (text or "")
    return len(t)


def truncate(text, max_chars=500, ellipsis="…"):
    """Truncate text to max_chars, appending ellipsis if cut."""
    t = text or ""
    return t if len(t) <= max_chars else t[:max_chars] + ellipsis


def slugify(text):
    """Convert text to a URL-friendly slug: "Hello World!" → "hello-world"."""
    s = (text or "").lower()
    s = re.sub(r"[^\w\s-]", "", s)
    return re.sub(r"[\s_]+", "-", s).strip("-")


def extract_emails(text):
    """Extract all email addresses from text."""
    return re.findall(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", text or "")


def extract_urls(text):
    """Extract all URLs from text."""
    return re.findall(r"https?://[^\s\"'>]+", text or "")


def extract_numbers(text):
    """Extract all numbers (int or float) from text as floats."""
    return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", text or "")]


def indent_text(text, spaces=4):
    """Indent every line of text by a given number of spaces."""
    pad = " " * spaces
    return "\n".join(pad + l for l in (text or "").splitlines())
