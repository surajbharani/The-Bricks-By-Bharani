import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '../store/useSession';

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
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-md bg-bg-panel border border-border-hair flex-shrink-0 mr-2 mt-0.5 flex items-center justify-center">
                <NanoBricksLogo size={14} />
              </div>
            )}

            <div
              className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-bg-elevated border border-border-hair text-text-hi rounded-br-sm'
                  : 'bg-bg-panel border border-border-hair text-text-hi rounded-bl-sm'
              }`}
            >
              <span className="whitespace-pre-wrap break-words">{msg.content}</span>
              {msg.streaming && <span className="caret" />}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
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
