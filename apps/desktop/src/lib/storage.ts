import { createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

// ── Device-backed file storage ────────────────────────────────────────────────
// All persisted stores (chat history, agent runs, memory, projects, theme, etc.)
// are saved to ~/Documents/Nano Bricks/data/<key>.json — user-visible, easy to
// back up, and device-local. Falls back to localStorage in browser dev mode.
//
// On first launch after update (files don't exist yet), reads fall through to
// localStorage for automatic zero-friction migration.

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const memoryMirror = new Map<string, string>();

async function getItem(key: string): Promise<string | null> {
  const mirrored = memoryMirror.get(key);
  if (mirrored !== undefined) return mirrored;

  if (IS_TAURI) {
    try {
      const value = await invoke<string | null>('read_data_file', { key });
      if (value != null) {
        memoryMirror.set(key, value);
        return value;
      }
      // null = file doesn't exist yet → fall through to localStorage for migration
    } catch { /* fall through */ }
  }

  try { return localStorage.getItem(key); } catch { return null; }
}

async function setItem(key: string, value: string): Promise<void> {
  memoryMirror.set(key, value);
  if (IS_TAURI) {
    try {
      await invoke('write_data_file', { key, value });
      return;
    } catch (e) {
      console.warn(`[storage] disk write failed for "${key}":`, e);
      return;
    }
  }
  try { localStorage.setItem(key, value); }
  catch (e) { console.warn(`[storage] localStorage write failed for "${key}":`, e); }
}

async function removeItem(key: string): Promise<void> {
  memoryMirror.delete(key);
  if (IS_TAURI) {
    try { await invoke('remove_data_file', { key }); } catch { /* ignore */ }
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return;
  }
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/** Remove a storage key from both files and localStorage. */
export async function clearStorageKey(key: string): Promise<void> {
  return removeItem(key);
}

/** Zustand-compatible async device-backed storage. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deviceStorage = createJSONStorage<any>(() => ({
  getItem,
  setItem,
  removeItem,
}));
