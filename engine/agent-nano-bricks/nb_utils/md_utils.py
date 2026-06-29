"""Markdown generation helpers. No dependencies."""


def heading(text, level=1):
    """Generate a Markdown heading: heading("Title", 2) → "## Title"."""
    return "#" * level + " " + text


def table(headers, rows):
    """Generate a Markdown table from headers (list) and rows (list of lists/tuples).
    table(["Name", "Score"], [["Alice", 95], ["Bob", 88]])"""
    hdr = "| " + " | ".join(str(h) for h in headers) + " |"
    div = "| " + " | ".join("---" for _ in headers) + " |"
    body = "\n".join("| " + " | ".join(str(c) for c in row) + " |" for row in rows)
    return f"{hdr}\n{div}\n{body}"


def table_from_dicts(rows, keys=None):
    """Generate a Markdown table from a list of dicts.
    keys limits/orders which columns to show."""
    if not rows:
        return ""
    cols = keys or list(rows[0].keys())
    return table(cols, [[r.get(k, "") for k in cols] for r in rows])


def code_block(code, lang=""):
    """Wrap code in a fenced code block."""
    return f"```{lang}\n{code}\n```"


def bullet_list(items):
    """Generate an unordered list."""
    return "\n".join(f"- {i}" for i in items)


def numbered_list(items):
    """Generate a numbered list."""
    return "\n".join(f"{n + 1}. {i}" for n, i in enumerate(items))


def bold(text):
    """Bold text."""
    return f"**{text}**"


def italic(text):
    """Italic text."""
    return f"*{text}*"


def link(text, url):
    """Markdown hyperlink."""
    return f"[{text}]({url})"


def image(alt, url):
    """Markdown image."""
    return f"![{alt}]({url})"


def blockquote(text):
    """Blockquote each line of text."""
    return "\n".join(f"> {l}" for l in text.splitlines())


def horizontal_rule():
    """Horizontal divider line."""
    return "---"


def section(title, content, level=2):
    """Convenience: heading + blank line + content."""
    return f"{heading(title, level)}\n\n{content}"


def report(title, sections):
    """Build a full markdown report.
    sections = [("Section Title", "content text"), ...]"""
    parts = [heading(title, 1), ""]
    for stitle, scontent in sections:
        parts.append(section(stitle, scontent, 2))
        parts.append("")
    return "\n".join(parts)
