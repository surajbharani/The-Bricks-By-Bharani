import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, type Message } from '../store/useSession';

export function ChatStream() {
  const { messages } = useSession();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 select-none">
        <div className="w-12 h-12 rounded-xl bg-bg-panel border border-border-hair flex items-center justify-center">
          <NanoBricksLogo />
        </div>
        <div className="text-center">
          <p className="text-text-hi font-display font-semibold text-lg">Nano Bricks</p>
          <p className="text-text-lo text-sm mt-1">Your AI agent, ready to work.</p>
        </div>
        <div className="flex gap-2 mt-2">
          {STARTERS.map((s) => (
            <div
              key={s}
              className="px-3 py-1.5 bg-bg-panel border border-border-hair rounded-lg text-xs text-text-lo hover:text-text-hi hover:border-red-core/30 transition-colors cursor-default"
            >
              {s}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <AnimatePresence initial={false}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}

// ── Single message bubble ─────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = () => {
    if (!window.speechSynthesis) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(msg.content);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="w-6 h-6 rounded-md bg-bg-panel border border-border-hair flex-shrink-0 mr-2 mt-0.5 flex items-center justify-center">
          <NanoBricksLogo size={14} />
        </div>
      )}

      <div className="max-w-[75%] flex flex-col gap-1.5">
        {/* Image attachments */}
        {msg.attachments?.filter((a) => a.type === 'image' && a.dataUrl).map((att, i) => (
          <img
            key={i}
            src={att.dataUrl}
            alt={att.name}
            className="rounded-xl max-w-[260px] max-h-[200px] object-cover border border-border-hair"
          />
        ))}

        {/* File / Search badges */}
        {msg.attachments?.filter((a) => a.type !== 'image').length ? (
          <div className="flex flex-wrap gap-1.5">
            {msg.attachments.filter((a) => a.type !== 'image').map((att, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-panel border border-border-hair rounded-full text-xs text-text-lo"
              >
                {att.type === 'file' ? '📄' : att.type === 'search' ? '🔍' : '▶'}
                {att.name}
              </span>
            ))}
          </div>
        ) : null}

        {/* Text bubble */}
        <div
          className={`relative px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-bg-elevated border border-border-hair text-text-hi rounded-br-sm'
              : 'bg-bg-panel border border-border-hair text-text-hi rounded-bl-sm'
          }`}
        >
          <span className="whitespace-pre-wrap break-words">{msg.content}</span>
          {msg.streaming && <span className="caret" />}

          {/* TTS button on assistant messages */}
          {!isUser && !msg.streaming && msg.content && (
            <button
              onClick={speak}
              title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
              className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-bg-elevated border border-border-hair flex items-center justify-center opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity"
              style={{ opacity: 0 }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => { if (!isSpeaking) e.currentTarget.style.opacity = '0'; }}
            >
              <SpeakerIcon speaking={isSpeaking} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

const STARTERS = ['Summarize a document', 'Write code', 'Research a topic'];

function NanoBricksLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="7" height="7" rx="1.5" fill="#FF1F2E" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" fill="#FF1F2E" opacity="0.6" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" fill="#FF1F2E" opacity="0.6" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" fill="#FF1F2E" opacity="0.3" />
    </svg>
  );
}

function SpeakerIcon({ speaking }: { speaking: boolean }) {
  return speaking ? (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FF1F2E" strokeWidth="2" strokeLinecap="round">
      <rect x="6" y="4" width="4" height="16" rx="1" fill="#FF1F2E" stroke="none" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="#FF1F2E" stroke="none" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 010 7.07" />
    </svg>
  );
}
