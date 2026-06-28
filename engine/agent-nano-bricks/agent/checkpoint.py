"""
Agent Nano Bricks — Checkpoint & Undo
A safety net users can trust: before the agent changes or deletes anything, the
original is backed up (copy-on-first-write). If a run goes wrong, the whole task
can be undone in one step — restoring every file to exactly how it was before.

This is the single biggest trust win for non-technical users, and something
most agents (including Hermes' end-user surface) don't offer.
"""
from __future__ import annotations

import json
import shutil
import time
import uuid
from pathlib import Path

CHECKPOINT_DIR = ".nanobricks_checkpoints"


class Checkpointer:
    """Copy-on-first-write backups for a single agent run. Backs up only the
    files the agent actually touches, so it's cheap even in a big workspace."""

    def __init__(self, workspace: Path):
        self.workspace = workspace.resolve()
        self.id = time.strftime("%Y%m%d-%H%M%S") + "-" + str(uuid.uuid4())[:6]
        self.dir = self.workspace / CHECKPOINT_DIR / self.id
        self.manifest: dict[str, str] = {}   # rel_path -> "modified" | "created"
        self._backed: set[str] = set()
        self.ok = True

    def _rel(self, target: Path) -> str | None:
        try:
            return str(target.resolve().relative_to(self.workspace))
        except Exception:
            return None

    def backup(self, target: Path) -> None:
        """Call BEFORE modifying/deleting `target`. Idempotent per path."""
        if not self.ok:
            return
        rel = self._rel(target)
        if rel is None or rel.startswith(CHECKPOINT_DIR) or rel.startswith(".nanobricks_memory"):
            return
        if rel in self._backed:
            return
        self._backed.add(rel)
        try:
            if target.exists():
                dest = self.dir / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                if target.is_dir():
                    shutil.copytree(target, dest, dirs_exist_ok=True)
                else:
                    shutil.copy2(target, dest)
                self.manifest[rel] = "modified"
            else:
                self.manifest[rel] = "created"
        except Exception:
            # Backup is best-effort — never block the actual operation.
            pass

    def finalize(self) -> bool:
        """Persist the manifest. Returns True if anything was captured."""
        if not self.ok or not self.manifest:
            return False
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            (self.dir / "manifest.json").write_text(
                json.dumps({"id": self.id, "created": time.time(), "files": self.manifest}),
                encoding="utf-8",
            )
            # Update the "latest" pointer so a plain undo restores this run.
            ptr = self.workspace / CHECKPOINT_DIR / "latest.txt"
            ptr.parent.mkdir(parents=True, exist_ok=True)
            ptr.write_text(self.id, encoding="utf-8")
            return True
        except Exception:
            return False


def restore_checkpoint(workspace: Path, checkpoint_id: str = "") -> dict:
    """Undo a run: put every touched file back to its pre-run state.
    Files the run CREATED are removed; files it MODIFIED are restored."""
    workspace = workspace.resolve()
    base = workspace / CHECKPOINT_DIR
    try:
        if not checkpoint_id:
            ptr = base / "latest.txt"
            if not ptr.exists():
                return {"ok": False, "error": "Nothing to undo."}
            checkpoint_id = ptr.read_text(encoding="utf-8").strip()

        cdir = base / checkpoint_id
        manifest_file = cdir / "manifest.json"
        if not manifest_file.exists():
            return {"ok": False, "error": f"Checkpoint not found: {checkpoint_id}"}

        data = json.loads(manifest_file.read_text(encoding="utf-8"))
        files = data.get("files", {})
        restored, removed = 0, 0
        for rel, kind in files.items():
            target = workspace / rel
            if kind == "created":
                # The run created it — undo means delete it.
                try:
                    if target.is_dir():
                        shutil.rmtree(target)
                    elif target.exists():
                        target.unlink()
                    removed += 1
                except Exception:
                    pass
            else:  # modified — copy the backup back over
                backup = cdir / rel
                if backup.exists():
                    try:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        if backup.is_dir():
                            shutil.copytree(backup, target, dirs_exist_ok=True)
                        else:
                            shutil.copy2(backup, target)
                        restored += 1
                    except Exception:
                        pass
        return {"ok": True, "restored": restored, "removed": removed, "checkpoint": checkpoint_id}
    except Exception as e:
        return {"ok": False, "error": str(e)}
