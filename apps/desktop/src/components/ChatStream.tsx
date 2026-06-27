import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, type Message } from '../store/useSession';
import { CodeRunner } from './CodeRunner';

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

            <div className={`max-w-[75%] flex flex-col gap-2`}>
              {/* Image attachments */}
              {msg.attachments?.map((att, i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-border-hair">
                  <img src={att.url} alt={att.prompt} className="w-full max-w-sm object-cover" />
                  <p className="px-3 py-1.5 text-[10px] text-text-lo bg-bg-panel">{att.prompt}</p>
                </div>
              ))}

              {/* Text content */}
              {msg.content && (
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-bg-elevated border border-border-hair text-text-hi rounded-br-sm'
                      : 'bg-bg-panel border border-border-hair text-text-hi rounded-bl-sm'
                  }`}
                >
                  {msg.role === 'assistant'
                    ? <AssistantContent message={msg} />
                    : <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                  }
                  {msg.streaming && <span className="caret" />}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}

// Parse and render assistant content, with CodeRunner for fenced code blocks
function AssistantContent({ message }: { message: Message }) {
  const parts = parseCodeBlocks(message.content);

  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return <span key={i}>{part.content}</span>;
        }
        return (
          <div key={i} className="my-2">
            <pre className="bg-bg-void rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto border border-border-hair">
              <code>{part.content}</code>
            </pre>
            <CodeRunner lang={part.lang} code={part.content} />
          </div>
        );
      })}
    </div>
  );
}

interface TextPart { type: 'text'; content: string }
interface CodePart { type: 'code'; lang: string; content: string }
type Part = TextPart | CodePart;

function parseCodeBlocks(text: string): Part[] {
  const parts: Part[] = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', lang: match[1] || 'text', content: match[2].trimEnd() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts;
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
