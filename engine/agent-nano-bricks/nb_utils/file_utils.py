"""File system utilities — find, rename, copy, diff, read/write. No dependencies."""
import os
import shutil
from pathlib import Path


def find(root, pattern="*", recursive=True):
    """Find files matching a glob pattern. Returns list of Path objects."""
    r = Path(root)
    return sorted(r.rglob(pattern) if recursive else r.glob(pattern))


def find_by_extension(root, *exts):
    """Find files by one or more extensions, e.g. find_by_extension(root, '.py', '.js')."""
    results = []
    for ext in exts:
        results.extend(Path(root).rglob(f"*{ext}"))
    return sorted(results)


def read_text(path, encoding="utf-8"):
    """Read a text file, returning its contents as a string."""
    return Path(path).read_text(encoding=encoding, errors="replace")


def write_text(path, text, encoding="utf-8"):
    """Write text to a file, creating parent directories as needed."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(text, encoding=encoding)


def append_text(path, text, encoding="utf-8"):
    """Append text to a file."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding=encoding) as f:
        f.write(text)


def batch_rename(root, old_suffix, new_suffix):
    """Rename all files with old_suffix to new_suffix in root (recursive).
    Returns list of new file paths."""
    changed = []
    for f in Path(root).rglob(f"*{old_suffix}"):
        nw = f.with_suffix(new_suffix)
        f.rename(nw)
        changed.append(str(nw))
    return changed


def batch_replace_in_files(root, old_text, new_text, pattern="*"):
    """Replace a string in every matching file under root.
    Returns count of files changed."""
    count = 0
    for f in Path(root).rglob(pattern):
        if not f.is_file():
            continue
        try:
            txt = f.read_text(encoding="utf-8", errors="replace")
            if old_text in txt:
                f.write_text(txt.replace(old_text, new_text), encoding="utf-8")
                count += 1
        except Exception:
            pass
    return count


def size_report(root, top=20):
    """Return total bytes and the top N largest files under root."""
    total = 0
    files = []
    for f in Path(root).rglob("*"):
        if f.is_file():
            try:
                s = f.stat().st_size
                total += s
                files.append({"path": str(f), "size_bytes": s})
            except Exception:
                pass
    files.sort(key=lambda x: -x["size_bytes"])
    return {"total_bytes": total, "total_mb": round(total / 1048576, 2), "top_files": files[:top]}


def diff_lines(path_a, path_b):
    """Simple line diff between two text files. Returns added/removed lists."""
    a = set(Path(path_a).read_text(encoding="utf-8", errors="replace").splitlines())
    b = set(Path(path_b).read_text(encoding="utf-8", errors="replace").splitlines())
    return {"added": sorted(b - a)[:100], "removed": sorted(a - b)[:100]}


def safe_copy(src, dst):
    """Copy a file or directory to dst, creating parent dirs."""
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    if Path(src).is_dir():
        shutil.copytree(str(src), str(dst), dirs_exist_ok=True)
    else:
        shutil.copy2(str(src), str(dst))


def ensure_dir(path):
    """Create directory (and parents) if it doesn't exist."""
    Path(path).mkdir(parents=True, exist_ok=True)
    return Path(path)


def file_age_seconds(path):
    """Return how many seconds ago the file was last modified."""
    import time
    return time.time() - Path(path).stat().st_mtime
