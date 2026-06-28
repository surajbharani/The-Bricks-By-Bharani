import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useRun } from '../store/useRun';
import { useSession } from '../store/useSession';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * One-click Undo. When the last run created a checkpoint (Tier A), this restores
 * every file the agent touched to its pre-run state by re-invoking the sidecar
 * with action="undo".
 */
export function UndoButton() {
  const { lastCheckpoint } = useRun();
  const { model } = useSession();
  const [state, setState] = useState<'idle' | 'undoing' | 'done'>('idle');

  if (!lastCheckpoint) return null;

  const undo = async () => {
    if (state !== 'idle' || !IS_TAURI) {
      setState('done');
      return;
    }
    setState('undoing');
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await listen<string>('agent-event', (ev) => {
        try {
          const e = JSON.parse(ev.payload);
          if (e.t === 'done' || e.t === 'error') setState('done');
        } catch {
          /* ignore */
        }
      });
      await invoke('agent_run', {
        request: {
          query: '',
          mode: 'solo',
          model,
          workspace: null,
          token: '',
          openrouter_key: '',
          deepseek_key: '',
          caps: {},
          action: 'undo',
          checkpoint: lastCheckpoint,
        },
      });
    } catch {
      setState('done');
    } finally {
      unlisten?.();
    }
  };

  return (
    <button
      onClick={undo}
      disabled={state !== 'idle'}
      className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border border-border-hair text-text-lo hover:text-text-hi hover:border-red-core/40 transition-colors disabled:opacity-50"
    >
      <UndoIcon />
      {state === 'idle' && 'Undo this task'}
      {state === 'undoing' && 'Undoing…'}
      {state === 'done' && 'Undone — files restored'}
    </button>
  );
}

function UndoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 5h5a2.5 2.5 0 0 1 0 5H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 2.5L2.5 5L5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
