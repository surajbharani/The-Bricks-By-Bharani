import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSession } from '../store/useSession';
import { useRun } from '../store/useRun';
import { useAuth } from '../store/useAuth';
import { supabase } from '../lib/supabase';
import type { AgentEvent } from '@nano-bricks/shared';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function AgentComposer() {
  const { agentMode, model, agentAskEnabled } = useSession();
  const { status, startRun, applyEvent, resetRun, agentHistory } = useRun();
  const { session } = useAuth();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  const isRunning = status === 'planning' || status === 'running';

  useEffect(() => {
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || isRunning) return;
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Build context from the most recent turns so the agent remembers the conversation
    const recentHistory = agentHistory.slice(-8);
    const contextPrefix = recentHistory.length > 0
      ? recentHistory.map((h) => `User: ${h.query}\nAssistant: ${h.response}`).join('\n\n') + '\n\n'
      : '';
    const queryWithContext = contextPrefix ? `${contextPrefix}User: ${trimmed}` : trimmed;

    startRun(trimmed);

    if (!IS_TAURI) {
      // Dev stub — simulate a quick done event
      setTimeout(() => {
        applyEvent({ t: 'thinking', text: 'Analysing your task…' });
      }, 300);
      setTimeout(() => {
        applyEvent({ t: 'plan', steps: ['Step 1: Understand the request', 'Step 2: Execute', 'Step 3: Summarise'] });
      }, 800);
      setTimeout(() => {
        applyEvent({ t: 'step', i: 0, label: 'Understand the request', status: 'ok' });
      }, 1200);
      setTimeout(() => {
        applyEvent({ t: 'token', text: 'This is a dev stub — Tauri sidecar not available in browser.\n' });
      }, 1500);
      setTimeout(() => {
        applyEvent({ t: 'done', ok: true, summary: 'Stub run complete.', tokensUsed: 42 });
      }, 2000);
      return;
    }

    // Grab the freshest possible JWT. The session in the store can be slightly
    // stale; ask Supabase directly so the agent never runs with an expired token
    // (which previously cascaded into the user being signed out).
    let jwt = session?.access_token ?? '';
    if (!useAuth.getState().isDev) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) jwt = data.session.access_token;
      } catch {
        // keep the store token as a fallback
      }
    }
    const openrouterKey = (import.meta.env.VITE_OPENROUTER_KEY as string | undefined) ?? '';
    const deepseekKey = (import.meta.env.VITE_DEEPSEEK_KEY as string | undefined) ?? '';

    // Listen for agent-event Tauri events. The completed turn is appended to
    // agentHistory atomically inside applyEvent() on the 'done'/'error' event.
    const unlisten = await listen<string>('agent-event', (ev) => {
      try {
        const parsed: AgentEvent = JSON.parse(ev.payload);
        applyEvent(parsed);
      } catch {
        // ignore malformed lines
      }
    });
    unlistenRef.current = unlisten;

    try {
      await invoke('agent_run', {
        request: {
          query: queryWithContext,
          mode: agentMode,
          model,
          workspace: null,
          token: jwt,
          openrouter_key: openrouterKey,
          deepseek_key: deepseekKey,
          caps: { max_steps: 20, max_concurrency: 4, max_inr: 50.0, allow_ask: agentAskEnabled },
        },
      });
    } catch (err) {
      applyEvent({ t: 'error', message: `Failed to start agent: ${err}` });
    } finally {
      unlisten();
      unlistenRef.current = null;
    }
  };

  const stop = () => {
    if (IS_TAURI) {
      invoke('agent_stop').catch(() => {});
    }
    unlistenRef.current?.();
    unlistenRef.current = null;
    resetRun();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const placeholder =
    agentMode === 'swarm'
      ? 'Describe a task — your Team of agents will tackle it in parallel…'
      : 'Describe a task — your agent will plan and execute it step by step…';

  return (
    <div className="px-4 pb-4">
      <div className="relative flex items-end gap-2 bg-bg-elevated border border-border-hair rounded-xl px-4 py-3 focus-within:border-red-core/40 focus-within:shadow-red-glow transition-all duration-200">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onInput={onInput}
          placeholder={placeholder}
          rows={1}
          disabled={isRunning}
          className="flex-1 resize-none bg-transparent text-sm text-text-hi placeholder-text-lo outline-none leading-relaxed"
          style={{ fontFamily: 'var(--display)', maxHeight: '160px' }}
        />

        {isRunning ? (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={stop}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: '#FF1F2E' }}
          >
            <StopIcon />
          </motion.button>
        ) : (
          <motion.button
            onClick={send}
            disabled={!text.trim()}
            whileTap={{ scale: 0.92 }}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
            style={{
              background: text.trim() ? '#FF1F2E' : '#26262B',
              cursor: text.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            <SendIcon />
          </motion.button>
        )}
      </div>
      <p className="text-center text-xs text-text-lo mt-2 opacity-50">
        Enter to send · Shift+Enter for new line · agent runs in your workspace
      </p>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 13L13 7L1 1V5.5L9 7L1 8.5V13Z" fill="#F4F4F6" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="1" y="1" width="8" height="8" rx="1" fill="#F4F4F6" />
    </svg>
  );
}
