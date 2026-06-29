import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSession } from '../store/useSession';
import { useRun } from '../store/useRun';
import { useAuth } from '../store/useAuth';
import { supabase } from '../lib/supabase';
import type { AgentEvent } from '@nano-bricks/shared';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface AttachmentChip {
  name: string;
  kind: 'image' | 'file';
  workspacePath: string;
}

export function AgentComposer() {
  const { agentMode, model, agentAskEnabled } = useSession();
  const { status, startRun, applyEvent, resetRun, agentHistory } = useRun();
  const { session } = useAuth();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AttachmentChip[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  const isRunning = status === 'planning' || status === 'running';

  useEffect(() => {
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;
    // Reset input so the same file can be re-attached after removal
    e.target.value = '';

    const added: AttachmentChip[] = [];

    for (const file of picked) {
      const kind: AttachmentChip['kind'] = file.type.startsWith('image/') ? 'image' : 'file';
      let workspacePath = file.name;

      if (IS_TAURI) {
        try {
          // Read file as base64 data URL, then copy into workspace via Tauri command
          const dataUrl = await readFileAsDataUrl(file);
          const fullPath: string = await invoke('write_to_workspace', {
            filename: file.name,
            data_b64: dataUrl,
          });
          workspacePath = fullPath;
        } catch (err) {
          console.error('[AgentComposer] copy to workspace failed:', err);
        }
      }

      added.push({ name: file.name, kind, workspacePath });
    }

    setAttachments((prev) => [...prev, ...added]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const send = async () => {
    const trimmed = text.trim();
    const currentAttachments = [...attachments];
    if ((!trimmed && currentAttachments.length === 0) || isRunning) return;

    // If user sent only attachments with no text, use a sensible default task
    const effectiveTrimmed = trimmed || 'Please work with the attached files.';

    setText('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Build context from the most recent turns so the agent remembers the conversation
    const recentHistory = agentHistory.slice(-8);
    const contextPrefix = recentHistory.length > 0
      ? recentHistory.map((h) => `User: ${h.query}\nAssistant: ${h.response}`).join('\n\n') + '\n\n'
      : '';
    const queryWithContext = contextPrefix ? `${contextPrefix}User: ${effectiveTrimmed}` : effectiveTrimmed;

    startRun(effectiveTrimmed);

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
          attachments: currentAttachments.map((a) => ({
            name: a.name,
            path: a.workspacePath,
            kind: a.kind,
          })),
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
      {/* Attachment chips */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-1.5 mb-2"
          >
            {attachments.map((a, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-bg-elevated border border-border-hair text-xs text-text-hi"
              >
                {a.kind === 'image' ? <ImageIcon /> : <FileIcon />}
                <span className="max-w-[120px] truncate">{a.name}</span>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="ml-0.5 text-text-lo hover:text-text-hi transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative flex items-end gap-2 bg-bg-elevated border border-border-hair rounded-xl px-4 py-3 focus-within:border-red-core/40 focus-within:shadow-red-glow transition-all duration-200">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.docx,.csv,.txt,.md,.json,.xlsx,.py,.js,.ts,.html,.css"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isRunning}
          title="Attach files or images"
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-white/5 transition-colors duration-150 disabled:opacity-40"
        >
          <PaperclipIcon />
        </button>

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
            disabled={!text.trim() && attachments.length === 0}
            whileTap={{ scale: 0.92 }}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
            style={{
              background: (text.trim() || attachments.length > 0) ? '#FF1F2E' : '#26262B',
              cursor: (text.trim() || attachments.length > 0) ? 'pointer' : 'not-allowed',
            }}
          >
            <SendIcon />
          </motion.button>
        )}
      </div>
      <p className="text-center text-xs text-text-lo mt-2 opacity-50">
        Enter to send · Shift+Enter for new line · 📎 attach files · agent runs in your workspace
      </p>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

function PaperclipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M12.5 6.5L6.5 12.5C5.12 13.88 2.88 13.88 1.5 12.5C0.12 11.12 0.12 8.88 1.5 7.5L7.5 1.5C8.33 0.67 9.67 0.67 10.5 1.5C11.33 2.33 11.33 3.67 10.5 4.5L4.5 10.5C4.09 10.91 3.41 10.91 3 10.5C2.59 10.09 2.59 9.41 3 9L8.5 3.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="0.5" y="0.5" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1" />
      <circle cx="3.5" cy="3.5" r="1" fill="currentColor" />
      <path d="M0.5 7.5L3 5L5 7L7.5 4.5L10.5 7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M2 1h5l3 3v6H2V1z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}
