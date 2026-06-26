import { useState, useRef, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../store/useSession';
import { streamChat } from '../lib/proxyClient';

export function Composer() {
  const { mode, agentMode, model, addMessage, appendToMessage, finalizeMessage, setStreaming, isStreaming } =
    useSession();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const placeholder =
    mode === 'chat'
      ? 'Ask anything…'
      : agentMode === 'swarm'
      ? 'Describe a task — your Team of agents will tackle it in parallel…'
      : 'Describe a task — your agent will plan and execute it step by step…';

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMsgId = addMessage({ role: 'user', content: trimmed });
    void userMsgId;

    const asstMsgId = addMessage({ role: 'assistant', content: '', streaming: true });
    setStreaming(true);

    try {
      const gen = streamChat({
        model,
        messages: [{ role: 'user', content: trimmed }],
      });
      for await (const chunk of gen) {
        appendToMessage(asstMsgId, chunk);
      }
    } catch (err) {
      appendToMessage(
        asstMsgId,
        `\n\n*Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}*`
      );
    } finally {
      finalizeMessage(asstMsgId);
      setStreaming(false);
    }
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
          disabled={isStreaming}
          className="flex-1 resize-none bg-transparent text-sm text-text-hi placeholder-text-lo outline-none leading-relaxed"
          style={{ fontFamily: 'var(--display)', maxHeight: '160px' }}
        />

        <motion.button
          onClick={send}
          disabled={!text.trim() || isStreaming}
          whileTap={{ scale: 0.92 }}
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
          style={{
            background: text.trim() && !isStreaming ? '#FF1F2E' : '#26262B',
            cursor: text.trim() && !isStreaming ? 'pointer' : 'not-allowed',
          }}
        >
          {isStreaming ? <StopIcon /> : <SendIcon />}
        </motion.button>
      </div>
      <p className="text-center text-xs text-text-lo mt-2 opacity-50">
        Press Enter to send · Shift+Enter for new line
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
