import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSession, type Message, type ThinkingConfig, type Attachment, type WebSource } from '../store/useSession';
import { CoTSection } from './CoTSection';
import { CodeBlock } from './CodeBlock';

export function ChatStream() {
  const { messages, thinking, setFeedback, setBranchIndex, regenerate, editAndResend, isStreaming } = useSession();
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

  const lastAsstIdx = messages.map((m) => m.role).lastIndexOf('assistant');

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <AnimatePresence initial={false}>
        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            thinking={thinking}
            isLastAssistant={idx === lastAsstIdx}
            isStreaming={isStreaming}
            onFeedback={(f) => setFeedback(msg.id, f)}
            onBranch={(i) => setBranchIndex(msg.id, i)}
            onRegenerate={regenerate}
            onEditAndResend={(newText) => editAndResend(msg.id, newText)}
          />
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

interface BubbleProps {
  msg: Message;
  thinking: ThinkingConfig;
  isLastAssistant: boolean;
  isStreaming: boolean;
  onFeedback: (f: 'like' | 'dislike') => void;
  onBranch: (i: number) => void;
  onRegenerate: () => void;
  onEditAndResend: (text: string) => void;
}

function MessageBubble({ msg, thinking, isLastAssistant, isStreaming, onFeedback, onBranch, onRegenerate, onEditAndResend }: BubbleProps) {
  const isUser = msg.role === 'user';
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.content);

  const speak = () => {
    if (!window.speechSynthesis) return;
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(msg.content);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const copyMsg = async () => {
    await navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const branchCount = msg.branches?.length ?? 1;
  const branchIdx = msg.branchIndex ?? 0;

  const submitEdit = () => {
    if (editText.trim()) onEditAndResend(editText.trim());
    setEditing(false);
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

      <div className="flex flex-col gap-1.5" style={{ maxWidth: 'var(--msg-max-w, 78%)' }}>
        {/* Web search block (Perplexity-style) */}
        {msg.attachments?.find((a) => a.type === 'web-search') && (
          <WebSearchBlock att={msg.attachments.find((a) => a.type === 'web-search')!} message={msg} />
        )}

        {/* Generated images */}
        {msg.attachments?.filter((a) => a.type === 'image-gen').map((att, i) => (
          <div key={i} className="rounded-xl overflow-hidden border border-border-hair">
            <img src={att.url} alt={att.prompt} className="w-full max-w-sm object-cover" />
            <p className="px-3 py-1.5 text-[10px] text-text-lo bg-bg-panel">{att.prompt}</p>
          </div>
        ))}

        {/* Uploaded image attachments */}
        {msg.attachments?.filter((a) => (a.type === 'image' || a.type === 'image-upload') && a.dataUrl).map((att, i) => (
          <img key={i} src={att.dataUrl} alt={att.name}
            className="rounded-xl max-w-[260px] max-h-[200px] object-cover border border-border-hair" />
        ))}

        {/* File / search badges */}
        {msg.attachments?.filter((a) => a.type !== 'image' && a.type !== 'image-upload' && a.type !== 'image-gen' && a.type !== 'web-search').length ? (
          <div className="flex flex-wrap gap-1.5">
            {msg.attachments.filter((a) => a.type !== 'image' && a.type !== 'image-upload' && a.type !== 'image-gen' && a.type !== 'web-search').map((att, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-panel border border-border-hair rounded-full text-xs text-text-lo">
                {att.type === 'file' ? '📄' : att.type === 'search' ? '🔍' : '▶'}
                {att.name}
              </span>
            ))}
          </div>
        ) : null}

        {/* Edit mode (user messages) */}
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); } if (e.key === 'Escape') setEditing(false); }}
              rows={3}
              className="w-full bg-bg-elevated border border-red-core/40 rounded-xl px-3 py-2 text-sm text-text-hi focus:outline-none resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs text-text-lo hover:text-text-hi border border-border-hair rounded-lg transition-colors">Cancel</button>
              <button onClick={submitEdit} className="px-3 py-1 text-xs bg-red-core text-white rounded-lg hover:bg-red-core/90 transition-colors">Re-send</button>
            </div>
          </div>
        ) : (
          <>
            {/* Text bubble */}
            <div
              className={`relative rounded-2xl leading-relaxed ${
                isUser
                  ? 'bg-bg-elevated border border-border-hair text-text-hi rounded-br-sm'
                  : 'bg-bg-panel border border-border-hair text-text-hi rounded-bl-sm'
              }`}
              style={{
                padding: 'var(--bubble-py, 0.75rem) var(--bubble-px, 1rem)',
                fontSize: 'var(--chat-font-size, 14px)',
                fontFamily: 'var(--chat-font-family, var(--display), "Nunito", system-ui, sans-serif)',
              }}
            >
              {isUser ? (
                <span className="whitespace-pre-wrap break-words">{msg.content}</span>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none
                  prose-p:my-1 prose-p:leading-relaxed
                  prose-headings:text-text-hi prose-headings:font-semibold
                  prose-a:text-red-core prose-a:no-underline hover:prose-a:underline
                  prose-strong:text-text-hi prose-strong:font-semibold
                  prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
                  prose-blockquote:border-red-core/40 prose-blockquote:text-text-lo
                  prose-hr:border-border-hair
                  prose-table:text-xs prose-th:text-text-lo prose-td:text-text-hi
                ">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      code(props: any) {
                        const { children, className } = props;
                        const lang = /language-(\w+)/.exec(className || '')?.[1] ?? '';
                        const isBlock = className?.includes('language-') || String(children).includes('\n');
                        if (!isBlock) {
                          return <code className="bg-bg-elevated px-1.5 py-0.5 rounded text-red-core/90 font-mono text-[0.82em]">{children}</code>;
                        }
                        return <CodeBlock language={lang} code={String(children).replace(/\n$/, '')} />;
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              )}
              {msg.streaming && <span className="caret" />}
            </div>

            {/* Chain-of-thought */}
            {!isUser && msg.reasoning && thinking.showSteps && (
              <CoTSection text={msg.reasoning} />
            )}

            {/* Action bar */}
            {!msg.streaming && (
              <div className={`flex items-center gap-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {/* Copy */}
                <ActionBtn title={copied ? 'Copied!' : 'Copy'} onClick={copyMsg}>
                  {copied
                    ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#28C76F" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  }
                </ActionBtn>

                {/* User-only: edit */}
                {isUser && (
                  <ActionBtn title="Edit & re-send" onClick={() => { setEditText(msg.content); setEditing(true); }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </ActionBtn>
                )}

                {/* Assistant-only actions */}
                {!isUser && (
                  <>
                    {/* Like */}
                    <ActionBtn title="Good response" onClick={() => onFeedback('like')} active={msg.feedback === 'like'}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill={msg.feedback === 'like' ? '#FF1F2E' : 'none'} stroke={msg.feedback === 'like' ? '#FF1F2E' : 'currentColor'} strokeWidth="2" strokeLinecap="round">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                        <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                      </svg>
                    </ActionBtn>

                    {/* Dislike */}
                    <ActionBtn title="Bad response" onClick={() => onFeedback('dislike')} active={msg.feedback === 'dislike'}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill={msg.feedback === 'dislike' ? '#FF1F2E' : 'none'} stroke={msg.feedback === 'dislike' ? '#FF1F2E' : 'currentColor'} strokeWidth="2" strokeLinecap="round">
                        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/>
                        <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
                      </svg>
                    </ActionBtn>

                    {/* TTS */}
                    <ActionBtn title={isSpeaking ? 'Stop speaking' : 'Read aloud'} onClick={speak} active={isSpeaking}>
                      <SpeakerIcon speaking={isSpeaking} />
                    </ActionBtn>

                    {/* Regenerate — only on last assistant message */}
                    {isLastAssistant && !isStreaming && (
                      <ActionBtn title="Regenerate response" onClick={onRegenerate}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polyline points="1 4 1 10 7 10"/>
                          <path d="M3.51 15a9 9 0 1 0 .49-3.76"/>
                        </svg>
                      </ActionBtn>
                    )}

                    {/* Branch navigator */}
                    {branchCount > 1 && (
                      <div className="flex items-center gap-0.5 ml-1">
                        <ActionBtn title="Previous version" onClick={() => onBranch(branchIdx - 1)} disabled={branchIdx === 0}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                        </ActionBtn>
                        <span className="text-[9px] text-text-lo">{branchIdx + 1}/{branchCount}</span>
                        <ActionBtn title="Next version" onClick={() => onBranch(branchIdx + 1)} disabled={branchIdx === branchCount - 1}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                        </ActionBtn>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────
function ActionBtn({ children, title, onClick, active, disabled }: {
  children: React.ReactNode; title: string; onClick: () => void; active?: boolean; disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-30 ${
        active ? 'text-red-core bg-red-core/10' : 'text-text-lo hover:text-text-hi hover:bg-bg-elevated'
      }`}
    >
      {children}
    </button>
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

// ── Web Search Block (Perplexity-style) ───────────────────────────────────────
function WebSearchBlock({ att }: { att: Attachment; message: Message }) {
  const status = att.webStatus ?? 'searching';
  const sources = att.sources ?? [];
  const query = att.query ?? '';

  const steps = [
    { id: 'searching', label: 'Searching the web', icon: '🔍' },
    { id: 'reading',   label: 'Reading sources',   icon: '📖' },
    { id: 'answering', label: 'Generating answer',  icon: '✨' },
  ];
  const stepOrder = ['searching', 'reading', 'answering', 'done'];
  const currentIdx = stepOrder.indexOf(status);

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-col gap-1.5 px-4 py-3 rounded-xl bg-bg-panel border border-border-hair">
        <p className="text-[10px] text-text-lo uppercase tracking-wide font-mono mb-1">🔍 Web search — {query}</p>
        {steps.map((step) => {
          const stepIdx = stepOrder.indexOf(step.id);
          const isDone = currentIdx > stepIdx || status === 'done';
          const isActive = stepOrder[currentIdx] === step.id && status !== 'done';
          return (
            <div key={step.id} className="flex items-center gap-2">
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                {isDone ? (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-ok text-xs">✓</motion.span>
                ) : isActive ? (
                  <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} className="w-2 h-2 rounded-full bg-red-core block" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-border-hair block" />
                )}
              </div>
              <span className={`text-xs ${isDone ? 'text-text-lo line-through' : isActive ? 'text-text-hi font-medium' : 'text-text-lo opacity-40'}`}>
                {step.icon} {step.label}
              </span>
              {isActive && (
                <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="text-[10px] text-red-core">…</motion.span>
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {sources.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <p className="text-[10px] text-text-lo uppercase tracking-wide font-mono mb-1.5 px-1">Sources</p>
            <div className="flex flex-wrap gap-2">
              {sources.map((src, idx) => <SourceChip key={idx} source={src} index={idx + 1} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SourceChip({ source, index }: { source: WebSource; index: number }) {
  return (
    <motion.a
      href={source.url} target="_blank" rel="noopener noreferrer"
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.05 }}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border-hair hover:border-red-core/40 transition-colors group max-w-[200px]"
      title={source.title}
    >
      <img src={`https://www.google.com/s2/favicons?domain=${source.domain}&sz=16`} alt="" className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      <span className="text-[10px] text-text-lo group-hover:text-text-hi truncate">[{index}] {source.domain}</span>
    </motion.a>
  );
}
