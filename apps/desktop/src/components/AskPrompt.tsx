import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useRun } from '../store/useRun';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Human-in-the-loop prompt. When the agent emits an `ask` event it pauses and
 * waits; this panel surfaces the question (or approval request) and sends the
 * user's answer back to the running sidecar via the `agent_answer` command.
 */
export function AskPrompt() {
  const { pendingAsk, clearAsk } = useRun();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  if (!pendingAsk) return null;

  const send = async (answer: string) => {
    if (sending) return;
    setSending(true);
    try {
      if (IS_TAURI) await invoke('agent_answer', { answer });
    } catch {
      // If the bridge fails, clearing still unblocks the UI.
    } finally {
      setText('');
      setSending(false);
      clearAsk();
    }
  };

  const isApproval = pendingAsk.kind === 'approval';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="my-3 rounded-xl border overflow-hidden"
        style={{ borderColor: isApproval ? '#FF1F2E55' : '#FFB02555', background: '#0A0A0F' }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2 border-b"
          style={{ borderColor: isApproval ? '#FF1F2E22' : '#FFB02522' }}
        >
          <motion.span
            className="w-2 h-2 rounded-full"
            style={{ background: isApproval ? '#FF1F2E' : '#FFB025' }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="text-[10px] font-mono uppercase tracking-widest text-text-lo">
            {isApproval ? 'Approval needed' : 'Agent is asking you'}
          </span>
        </div>

        <div className="p-4">
          <p className="text-sm text-text-hi whitespace-pre-wrap leading-relaxed mb-3">
            {pendingAsk.question}
          </p>

          {isApproval ? (
            <div className="flex gap-2">
              <button
                onClick={() => send('Yes')}
                disabled={sending}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: '#00C853' }}
              >
                Allow
              </button>
              <button
                onClick={() => send('No')}
                disabled={sending}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: '#FF1F2E' }}
              >
                Deny
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pendingAsk.options && pendingAsk.options.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingAsk.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => send(opt)}
                      disabled={sending}
                      className="px-3 py-1.5 rounded-lg text-xs border border-border-hair text-text-hi hover:border-red-core/40"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && text.trim()) send(text.trim());
                  }}
                  placeholder="Type your answer…"
                  className="flex-1 bg-bg-elevated border border-border-hair rounded-lg px-3 py-2 text-sm text-text-hi outline-none focus:border-red-core/40"
                />
                <button
                  onClick={() => text.trim() && send(text.trim())}
                  disabled={sending || !text.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: text.trim() ? '#FF1F2E' : '#26262B' }}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
