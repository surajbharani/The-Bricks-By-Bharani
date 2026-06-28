"""
Agent Nano Bricks — Persistent Memory
Cross-session memory store. The agent remembers the user, past tasks, and
learned facts across every session — built on stdlib sqlite3 (no deps).

Mirrors Hermes Agent's closed learning loop, scoped to the app dashboard:
  • user_facts   — durable facts the agent learns about the user
  • turns        — every query + outcome, searchable by keyword
  • sessions     — rolling summaries of past sessions for recall

A per-user namespace is derived from the auth token so each account has its
own private memory. Everything degrades gracefully — a memory failure never
crashes a run.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import sqlite3
import time
from pathlib import Path
from typing import Optional


def _user_namespace(token: str) -> str:
    """Derive a stable, private namespace from the JWT (no verification —
    only used to separate one account's memory from another's)."""
    if not token or token == "dev-token":
        return "local"
    # Try to read the JWT 'sub' claim
    try:
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        sub = payload.get("sub") or payload.get("user_id") or payload.get("email")
        if sub:
            return hashlib.sha256(str(sub).encode()).hexdigest()[:16]
    except Exception:
        pass
    return hashlib.sha256(token.encode()).hexdigest()[:16]


def _keywords(text: str) -> list[str]:
    words = re.findall(r"[a-zA-Z0-9_]{3,}", (text or "").lower())
    # de-dup, keep order, cap
    seen: set[str] = set()
    out: list[str] = []
    for w in words:
        if w not in seen:
            seen.add(w)
            out.append(w)
    return out[:40]


class MemoryStore:
    """SQLite-backed per-user memory. Safe to construct anywhere; all methods
    swallow errors so memory is always best-effort, never fatal."""

    def __init__(self, base_dir: Path, token: str = ""):
        self.ns = _user_namespace(token)
        self.ok = False
        self.db: Optional[sqlite3.Connection] = None
        try:
            mem_dir = base_dir / ".nanobricks_memory"
            mem_dir.mkdir(parents=True, exist_ok=True)
            self.db = sqlite3.connect(
                str(mem_dir / f"{self.ns}.db"),
                check_same_thread=False,
                timeout=10.0,
            )
            self.db.execute("PRAGMA journal_mode=WAL")
            self._init_schema()
            self.ok = True
        except Exception:
            self.ok = False

    def _init_schema(self) -> None:
        assert self.db is not None
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS user_facts (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                fact    TEXT NOT NULL UNIQUE,
                weight  REAL DEFAULT 1.0,
                created REAL
            );
            CREATE TABLE IF NOT EXISTS turns (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                query    TEXT,
                summary  TEXT,
                keywords TEXT,
                ok       INTEGER,
                created  REAL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                summary  TEXT,
                created  REAL
            );
            CREATE INDEX IF NOT EXISTS idx_turns_created ON turns(created);
            """
        )
        self.db.commit()

    # ── Writing ───────────────────────────────────────────────────────────────

    def record_turn(self, query: str, summary: str, ok: bool) -> None:
        if not self.ok:
            return
        try:
            kws = " ".join(_keywords(query + " " + summary))
            self.db.execute(
                "INSERT INTO turns (query, summary, keywords, ok, created) VALUES (?,?,?,?,?)",
                (query[:2000], summary[:2000], kws, 1 if ok else 0, time.time()),
            )
            self.db.commit()
        except Exception:
            pass

    def remember_fact(self, fact: str) -> None:
        if not self.ok or not fact.strip():
            return
        try:
            self.db.execute(
                "INSERT OR IGNORE INTO user_facts (fact, created) VALUES (?,?)",
                (fact.strip()[:500], time.time()),
            )
            self.db.commit()
        except Exception:
            pass

    def record_session_summary(self, summary: str) -> None:
        if not self.ok or not summary.strip():
            return
        try:
            self.db.execute(
                "INSERT INTO sessions (summary, created) VALUES (?,?)",
                (summary[:1500], time.time()),
            )
            self.db.commit()
        except Exception:
            pass

    # ── Reading ───────────────────────────────────────────────────────────────

    def user_facts(self, limit: int = 30) -> list[str]:
        if not self.ok:
            return []
        try:
            rows = self.db.execute(
                "SELECT fact FROM user_facts ORDER BY weight DESC, created DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [r[0] for r in rows]
        except Exception:
            return []

    def recent_sessions(self, limit: int = 5) -> list[str]:
        if not self.ok:
            return []
        try:
            rows = self.db.execute(
                "SELECT summary FROM sessions ORDER BY created DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [r[0] for r in rows]
        except Exception:
            return []

    def search_turns(self, query: str, limit: int = 5) -> list[dict]:
        """Keyword-rank past turns relevant to the current query."""
        if not self.ok:
            return []
        try:
            terms = _keywords(query)[:12]
            if not terms:
                return []
            rows = self.db.execute(
                "SELECT query, summary, keywords, created FROM turns ORDER BY created DESC LIMIT 400"
            ).fetchall()
            scored = []
            for q, s, kw, created in rows:
                kwset = set((kw or "").split())
                score = sum(1 for t in terms if t in kwset)
                if score:
                    scored.append((score, created, q, s))
            scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
            return [{"query": q, "summary": s} for _, _, q, s in scored[:limit]]
        except Exception:
            return []

    # ── Context block ─────────────────────────────────────────────────────────

    def build_context_block(self, current_query: str) -> str:
        """Assemble a system-prompt memory block to prepend to a run.
        Returns '' if there's nothing remembered yet."""
        if not self.ok:
            return ""
        facts = self.user_facts()
        sessions = self.recent_sessions(4)
        related = self.search_turns(current_query, 4)

        if not (facts or sessions or related):
            return ""

        parts = ["# MEMORY — what you already know\n"]
        if facts:
            parts.append("## About the user")
            parts.extend(f"- {f}" for f in facts[:20])
            parts.append("")
        if sessions:
            parts.append("## Recent sessions")
            parts.extend(f"- {s}" for s in sessions)
            parts.append("")
        if related:
            parts.append("## Related past tasks")
            for r in related:
                parts.append(f"- Task: {r['query'][:120]} → {r['summary'][:160]}")
            parts.append("")
        parts.append(
            "Use this memory naturally. Do not re-ask things you already know. "
            "If you learn new durable facts about the user, note them in your response."
        )
        return "\n".join(parts)

    def close(self) -> None:
        try:
            if self.db:
                self.db.close()
        except Exception:
            pass


# ── Fact extraction ───────────────────────────────────────────────────────────

_FACT_PATTERNS = [
    re.compile(r"\bmy name is ([A-Z][a-zA-Z ]{1,40})", re.IGNORECASE),
    re.compile(r"\bi am (?:a |an )?([a-zA-Z ]{3,40}?)(?:\.|,|$)", re.IGNORECASE),
    re.compile(r"\bi (?:like|prefer|love|want|use|need) ([a-zA-Z0-9 ,]{3,60})", re.IGNORECASE),
    re.compile(r"\bi'm (?:a |an )?([a-zA-Z ]{3,40}?)(?:\.|,|$)", re.IGNORECASE),
    re.compile(r"\bcall me ([A-Z][a-zA-Z ]{1,30})", re.IGNORECASE),
]


def extract_facts(text: str) -> list[str]:
    """Cheap heuristic extraction of durable user facts from a message.
    Conservative — better to miss than to remember noise."""
    facts: list[str] = []
    for pat in _FACT_PATTERNS:
        for m in pat.finditer(text or ""):
            phrase = m.group(0).strip().rstrip(".,")
            if 6 <= len(phrase) <= 120:
                facts.append(phrase)
    # de-dup
    seen: set[str] = set()
    out: list[str] = []
    for f in facts:
        k = f.lower()
        if k not in seen:
            seen.add(k)
            out.append(f)
    return out[:5]
