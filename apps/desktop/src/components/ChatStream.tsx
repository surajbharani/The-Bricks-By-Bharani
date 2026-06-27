import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, type Message, type Attachment, type WebSource } from '../store/useSession';
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

            <div className={`max-w-[80%] flex flex-col gap-2`}>
              {/* Web search block — full Perplexity-style */}
              {msg.attachments?.find((a) => a.type === 'web-search') && (
                <WebSearchBlock att={msg.attachments.find((a) => a.type === 'web-search')!} message={msg} />
              )}

              {/* Other attachments */}
              {msg.attachments?.filter((a) => a.type !== 'web-search').map((att, i) => {
                if (att.type === 'image-gen') {
                  return (
                    <div key={i} className="rounded-xl overflow-hidden border border-border-hair">
                      <img src={att.url} alt={att.prompt} className="w-full max-w-sm object-cover" />
                      <p className="px-3 py-1.5 text-[10px] text-text-lo bg-bg-panel">{att.prompt}</p>
                    </div>
                  );
                }
                if (att.type === 'image-upload' && att.dataUrl) {
                  return (
                    <div key={i} className="rounded-xl overflow-hidden border border-border-hair">
                      <img src={att.dataUrl} alt={att.name} className="w-full max-w-sm object-cover" />
                    </div>
                  );
                }
                if (att.type === 'search') {
                  return (
                    <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border-hair text-[10px] text-text-lo">
                      🔍 {att.name}
                    </div>
                  );
                }
                return null;
              })}

              {/* Text content — skip for web-search messages (rendered inside WebSearchBlock) */}
              {msg.content && !msg.attachments?.find((a) => a.type === 'web-search') && (
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

// ── Web Search Block (Perplexity-style) ───────────────────────────────────────
function WebSearchBlock({ att, message }: { att: Attachment; message: Message }) {
  const status = att.webStatus ?? 'searching';
  const sources = att.sources ?? [];
  const query = att.query ?? '';

  const steps: Array<{ id: string; label: string; icon: string }> = [
    { id: 'searching', label: 'Searching the web', icon: '🔍' },
    { id: 'reading',   label: 'Reading sources',   icon: '📖' },
    { id: 'answering', label: 'Generating answer',  icon: '✨' },
  ];

  const stepOrder = ['searching', 'reading', 'answering', 'done'];
  const currentIdx = stepOrder.indexOf(status);

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Timeline steps */}
      <div className="flex flex-col gap-1.5 px-4 py-3 rounded-xl bg-bg-panel border border-border-hair">
        <p className="text-[10px] text-text-lo uppercase tracking-wide font-mono mb-1">
          🔍 Web search — {query}
        </p>
        {steps.map((step) => {
          const stepIdx = stepOrder.indexOf(step.id);
          const isDone = currentIdx > stepIdx || status === 'done';
          const isActive = stepOrder[currentIdx] === step.id && status !== 'done';

          return (
            <div key={step.id} className="flex items-center gap-2">
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                {isDone ? (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-ok text-xs"
                  >✓</motion.span>
                ) : isActive ? (
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-2 h-2 rounded-full bg-red-core block"
                  />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-border-hair block" />
                )}
              </div>
              <span className={`text-xs ${isDone ? 'text-text-lo line-through' : isActive ? 'text-text-hi font-medium' : 'text-text-lo opacity-40'}`}>
                {step.icon} {step.label}
              </span>
              {isActive && (
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="text-[10px] text-red-core"
                >…</motion.span>
              )}
            </div>
          );
        })}
      </div>

      {/* Sources */}
      <AnimatePresence>
        {sources.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="overflow-hidden"
          >
            <p className="text-[10px] text-text-lo uppercase tracking-wide font-mono mb-1.5 px-1">Sources</p>
            <div className="flex flex-wrap gap-2">
              {sources.map((src, idx) => (
                <SourceChip key={idx} source={src} index={idx + 1} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Answer */}
      <AnimatePresence>
        {(message.content || message.streaming) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 py-3 rounded-2xl rounded-bl-sm bg-bg-panel border border-border-hair text-sm text-text-hi leading-relaxed"
          >
            <AssistantContent message={message} />
            {message.streaming && <span className="caret" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SourceChip({ source, index }: { source: WebSource; index: number }) {
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${source.domain}&sz=16`;

  return (
    <motion.a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border-hair hover:border-red-core/40 transition-colors group max-w-[200px]"
      title={source.title}
    >
      <img
        src={faviconUrl}
        alt=""
        className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <span className="text-[10px] text-text-lo group-hover:text-text-hi truncate">[{index}] {source.domain}</span>
    </motion.a>
  );
}

// ── Assistant text renderer ────────────────────────────────────────────────────
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
