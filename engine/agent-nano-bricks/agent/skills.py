"""
Agent Nano Bricks — Skill Memory
After a successful complex task, the agent distills a reusable "skill" (a short
how-to) and stores it. On future similar tasks, matching skills are recalled and
injected so the agent gets faster and better over time.

Mirrors Hermes Agent's autonomous skill creation, scoped to the app and built
on the same per-user sqlite memory file.
"""
from __future__ import annotations

import re
import time
from typing import Optional

from openai import OpenAI


def _keywords(text: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z0-9_]{3,}", (text or "").lower()))


class SkillStore:
    """Stores/recalls skills inside the same MemoryStore sqlite connection."""

    def __init__(self, memory):
        self.memory = memory
        self.ok = bool(memory and getattr(memory, "ok", False))
        if self.ok:
            try:
                self.memory.db.execute(
                    """CREATE TABLE IF NOT EXISTS skills (
                        id       INTEGER PRIMARY KEY AUTOINCREMENT,
                        title    TEXT,
                        body     TEXT,
                        keywords TEXT,
                        uses     INTEGER DEFAULT 0,
                        created  REAL
                    )"""
                )
                self.memory.db.commit()
            except Exception:
                self.ok = False

    def recall(self, query: str, limit: int = 3) -> list[dict]:
        if not self.ok:
            return []
        try:
            terms = _keywords(query)
            if not terms:
                return []
            rows = self.memory.db.execute(
                "SELECT id, title, body, keywords FROM skills ORDER BY uses DESC, created DESC LIMIT 200"
            ).fetchall()
            scored = []
            for sid, title, body, kw in rows:
                overlap = len(terms & set((kw or "").split()))
                if overlap >= 2:
                    scored.append((overlap, sid, title, body))
            scored.sort(reverse=True)
            picked = scored[:limit]
            for _, sid, _, _ in picked:
                try:
                    self.memory.db.execute("UPDATE skills SET uses = uses + 1 WHERE id = ?", (sid,))
                except Exception:
                    pass
            self.memory.db.commit()
            return [{"title": t, "body": b} for _, _, t, b in picked]
        except Exception:
            return []

    def skills_block(self, query: str) -> str:
        skills = self.recall(query)
        if not skills:
            return ""
        parts = ["# LEARNED SKILLS — apply if relevant\n"]
        for s in skills:
            parts.append(f"## {s['title']}\n{s['body']}\n")
        return "\n".join(parts)

    def maybe_learn(self, client: OpenAI, model: str, query: str, summary: str, ok: bool) -> None:
        """If the task was complex and succeeded, distill and store a skill."""
        if not self.ok or not ok:
            return
        # Only bother for non-trivial tasks
        if len(query) < 40:
            return
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "From this completed task, write a SHORT reusable skill that would help "
                            "next time a similar task appears. Output JSON: "
                            '{"title": "...", "body": "step-by-step how-to, 5 lines max"}. '
                            "If the task is too trivial to be worth a skill, output {\"title\": \"\"}."
                        ),
                    },
                    {"role": "user", "content": f"Task: {query}\n\nOutcome: {summary}"},
                ],
                max_tokens=300,
            )
            import json
            text = resp.choices[0].message.content or ""
            text = re.sub(r"```(?:json)?", "", text).strip()
            m = re.search(r"\{.*\}", text, re.DOTALL)
            if not m:
                return
            data = json.loads(m.group())
            title = (data.get("title") or "").strip()
            body = (data.get("body") or "").strip()
            if not title or not body:
                return
            kws = " ".join(_keywords(query + " " + title + " " + body))
            self.memory.db.execute(
                "INSERT INTO skills (title, body, keywords, created) VALUES (?,?,?,?)",
                (title[:120], body[:800], kws, time.time()),
            )
            self.memory.db.commit()
        except Exception:
            pass
