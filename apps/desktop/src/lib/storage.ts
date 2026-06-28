import { createJSONStorage } from 'zustand/middleware';

// ── Device-backed storage for every persisted store ──────────────────────────
//
// In the Nano Bricks desktop app this is the user's OWN device storage: the
// Tauri WebView persists localStorage to a file on disk inside the app's data
// directory (Windows: %APPDATA%\com.nanobricks.app, macOS: ~/Library). It is
// NOT cloud storage and it survives restarts. Everything that uses this —
// chat history, agent runs, memory, projects, theme, scheduler — lives on the
// user's machine.
//
// Hardening on top of plain localStorage:
//  • Writes never throw. A quota or serialization error is caught and the value
//    is kept in an in-memory mirror, so a failed save can NEVER crash the app
//    (this is exactly the kind of throw that used to bounce users out of Agent
//    mode mid-run).
//  • Reads fall back to the in-memory mirror if localStorage is unavailable.

const memoryMirror = new Map<string, string>();

function getItem(key: string): string | null {
  // Prefer the in-memory mirror: it always holds the most recent value written
  // this session (e.g. after a disk write failed, the mirror is newer than the
  // stale value still on disk). On a fresh launch the mirror is empty, so we
  // correctly read the persisted value from disk.
  const mirrored = memoryMirror.get(key);
  if (mirrored !== undefined) return mirrored;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setItem(key: string, value: string): void {
  // Always keep the latest value in memory so the running session is correct
  // even if the disk write fails.
  memoryMirror.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // QuotaExceededError or similar — never propagate; the value stays in the
    // memory mirror for this session.
    console.warn(`[storage] disk write failed for "${key}" (kept in memory):`, e);
  }
}

function removeItem(key: string): void {
  memoryMirror.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Zustand-compatible, crash-proof, device-backed storage. */
export const deviceStorage = createJSONStorage(() => ({ getItem, setItem, removeItem }));
