import {
  useState, useRef, useEffect, useCallback, type KeyboardEvent,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, type Attachment, type WebSource } from '../store/useSession';
import { useTools } from '../store/useTools';
import { useToast } from '../store/useToast';
import { streamChat } from '../lib/proxyClient';
import { searchWeb, formatResultsAsContext } from '../lib/webSearch';
import { generateImage, IMAGE_MODELS, type ImageModel } from '../lib/imageGen';
import { supabase } from '../lib/supabase';

const PROXY_BASE = import.meta.env.VITE_PROXY_URL ?? 'https://api.nanobricks.app';

// ── File text extraction (PDF / DOCX / CSV / TXT) ────────────────────────────
async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
    const pdfWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const buf = await file.arrayBuffer();
    const pdf = await getDocument({ data: buf }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      parts.push(tc.items.map((it) => ('str' in it ? it.str : '')).join(' '));
    }
    return parts.join('\n');
  }
  if (name.endsWith('.docx')) {
    const mod = await import('mammoth');
    const mammoth = (mod.default ?? mod) as {
      extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
    };
    return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  }
  return (await file.text()).slice(0, 8000);
}

// ── Main Composer ─────────────────────────────────────────────────────────────
type ActiveMode = 'web' | 'image' | null;

export function Composer() {
  const { mode, agentMode, model, messages, addMessage, appendToMessage, updateMessage, finalizeMessage, setStreaming, isStreaming } =
    useSession();
  const { isEnabled } = useTools();
  const { addToast, removeToast } = useToast();

  const [text, setText]             = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [plusOpen, setPlusOpen]     = useState(false);
  const [activeMode, setActiveMode] = useState<ActiveMode>(null);
  const [imageModel, setImageModel] = useState<ImageModel>('openai/dall-e-3');
  const [isListening, setIsListening] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusRef     = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Close + menu on outside click
  useEffect(() => {
    if (!plusOpen) return;
    const handler = (e: MouseEvent) => {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) setPlusOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [plusOpen]);

  // Global Escape — dismiss active mode regardless of which element has focus
  useEffect(() => {
    if (!activeMode) return;
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setActiveMode(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeMode]);

  // Focus composer on Ctrl+L
  useEffect(() => {
    const handler = () => { setText(''); textareaRef.current?.focus(); };
    window.addEventListener('focus-composer', handler);
    return () => window.removeEventListener('focus-composer', handler);
  }, []);

  const placeholder =
    activeMode === 'web'   ? 'Type your question and press send…' :
    activeMode === 'image' ? 'Describe the image you want to generate and press send…' :
    mode === 'chat'        ? 'Ask anything…' :
    agentMode === 'swarm'  ? 'Describe a task — your Team will tackle it in parallel…' :
                             'Describe a task — your agent will plan and execute it…';

  // ── Voice ──────────────────────────────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { addToast({ message: 'Speech recognition not available in this browser.', type: 'error' }); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const t = Array.from(e.results as SpeechRecognitionResultList).map((r) => r[0].transcript).join('');
      setText(t);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
    setPlusOpen(false);
  }, [isListening, addToast]);

  // ── Attach file (images + docs unified) ───────────────────────────────────
  const handleFileSelected = async (file: File) => {
    const isImage = file.type.startsWith('image/');
    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [...prev, {
          type: 'image-upload', name: file.name, dataUrl: reader.result as string, mimeType: file.type,
        }]);
      };
      reader.readAsDataURL(file);
    } else {
      try {
        const extracted = await extractFileText(file);
        setAttachments((prev) => [...prev, { type: 'file', name: file.name, text: extracted }]);
      } catch {
        addToast({ message: `Could not read "${file.name}". Try PDF, DOCX, CSV, or TXT.`, type: 'error' });
      }
    }
  };

  // ── Toggle a mode (web / image) ────────────────────────────────────────────
  const toggleMode = (m: ActiveMode) => {
    setActiveMode((prev) => prev === m ? null : m);
    setPlusOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // ── Send ───────────────────────────────────────────────────────────────────
  const send = async () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isStreaming) return;

    // ── Image generation mode ──────────────────────────────────────────────
    if (activeMode === 'image' && trimmed) {
      setText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      setActiveMode(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? '';
        const toastId = addToast({ message: 'Generating image…', type: 'info', duration: 0 });
        // Show user prompt
        addMessage({ role: 'user', content: trimmed });
        const url = await generateImage(trimmed, imageModel, token, PROXY_BASE);
        removeToast(toastId);
        addMessage({ role: 'assistant', content: '', attachments: [{ type: 'image-gen', url, prompt: trimmed }] });
      } catch (err) {
        addToast({ message: err instanceof Error ? err.message : 'Image generation failed', type: 'error' });
      }
      return;
    }

    const snap = [...attachments];
    setText('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // ── Web search mode — Perplexity-style live timeline ──────────────────
    if (activeMode === 'web' && trimmed) {
      setActiveMode(null);
      addMessage({ role: 'user', content: trimmed });

      // Create assistant message with live web-search attachment
      const asstMsgId = addMessage({
        role: 'assistant',
        content: '',
        streaming: true,
        attachments: [{ type: 'web-search', webStatus: 'searching', query: trimmed, sources: [] }],
      });
      setStreaming(true);

      let sources: WebSource[] = [];
      let contextPrefix = '';
      try {
        // Step 1 — searching (already shown)
        await new Promise((r) => setTimeout(r, 600));

        // Step 2 — reading
        updateMessage(asstMsgId, {
          attachments: [{ type: 'web-search', webStatus: 'reading', query: trimmed, sources: [] }],
        });
        const results = await searchWeb(trimmed);
        sources = results;
        contextPrefix = formatResultsAsContext(trimmed, results);

        // Step 3 — answering
        updateMessage(asstMsgId, {
          attachments: [{ type: 'web-search', webStatus: 'answering', query: trimmed, sources }],
        });
        await new Promise((r) => setTimeout(r, 300));

        const historyMsgs = messages
          .filter((m) => !m.streaming && m.content)
          .map((m) => ({ role: m.role, content: m.content }));
        const gen = streamChat({ model, messages: [...historyMsgs, { role: 'user', content: contextPrefix }] });
        for await (const chunk of gen) appendToMessage(asstMsgId, chunk);
      } catch (err) {
        if (err instanceof Error) appendToMessage(asstMsgId, `\n\n*Error: ${err.message}*`);
      } finally {
        updateMessage(asstMsgId, {
          streaming: false,
          attachments: [{ type: 'web-search', webStatus: 'done', query: trimmed, sources }],
        });
        setStreaming(false);
        finalizeMessage(asstMsgId);
      }
      return;
    }

    setActiveMode(null);

    // File context prefix
    let contextPrefix = '';
    for (const fa of snap.filter((a) => a.type === 'file')) {
      contextPrefix += `[File: ${fa.name}]\n${(fa.text ?? '').slice(0, 6000)}\n---\n\n`;
    }

    const displayAttachments = snap.filter((a) => a.type !== 'file');
    addMessage({ role: 'user', content: trimmed, attachments: displayAttachments.length ? displayAttachments : undefined });

    const fullText = contextPrefix + (trimmed || '(see attached)');
    const asstMsgId = addMessage({ role: 'assistant', content: '', streaming: true });
    setStreaming(true);
    const toastId = addToast({ message: 'AI is thinking…', type: 'info', duration: 0 });

    try {
      const historyMsgs = messages
        .filter((m) => !m.streaming && m.content)
        .map((m) => ({ role: m.role, content: m.content }));
      const gen = streamChat({ model, messages: [...historyMsgs, { role: 'user', content: fullText }] });
      for await (const chunk of gen) appendToMessage(asstMsgId, chunk);
    } catch (err) {
      if (err instanceof Error) {
        appendToMessage(asstMsgId, `\n\n*Error: ${err.message}*`);
        addToast({ message: 'Something went wrong. Please try again.', type: 'error', duration: 5000 });
      }
    } finally {
      finalizeMessage(asstMsgId);
      setStreaming(false);
      removeToast(toastId);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') setActiveMode(null);
  };

  const onInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const removeAttachment = (idx: number) => setAttachments((prev) => prev.filter((_, i) => i !== idx));
  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isStreaming;

  const webEnabled   = isEnabled('web_search');
  const imageEnabled = isEnabled('image_gen');

  return (
    <>
      {/* Hidden unified file input — accepts images + docs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.docx,.csv,.txt"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ''; }}
      />

      <div className="px-4 pb-4">

        {/* Active mode pill */}
        <AnimatePresence>
          {activeMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-2"
            >
              <div className="flex items-center gap-2 px-3 py-2 bg-red-core/10 border border-red-core/30 rounded-xl">
                <span className="text-sm">{activeMode === 'web' ? '🔍' : '🎨'}</span>
                <span className="text-xs font-semibold text-red-core">
                  {activeMode === 'web' ? 'Web Search mode' : 'Image Generation mode'}
                </span>

                {/* Model picker for image gen */}
                {activeMode === 'image' && (
                  <div className="ml-auto flex items-center gap-1">
                    {IMAGE_MODELS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setImageModel(m.id)}
                        className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                          imageModel === m.id
                            ? 'border-red-core text-red-core bg-red-core/10'
                            : 'border-border-hair text-text-lo hover:text-text-hi'
                        }`}
                      >
                        {m.id === 'openai/dall-e-3' ? 'DALL·E 3' : 'Gemini'}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setActiveMode(null); }}
                  className="text-red-core/60 hover:text-red-core text-xs ml-2 px-1"
                  aria-label="Cancel mode"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-bg-elevated border border-border-hair rounded-xl focus-within:border-red-core/40 focus-within:shadow-red-glow transition-all duration-200">

          {/* Attachment chips */}
          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="flex flex-wrap gap-2 px-3 pt-3 overflow-hidden"
              >
                {attachments.map((att, idx) => (
                  <div key={idx} className="relative group flex items-center gap-1.5 bg-bg-panel border border-border-hair rounded-lg overflow-hidden">
                    {att.type === 'image-upload' && att.dataUrl ? (
                      <img src={att.dataUrl} alt={att.name} className="h-14 w-14 object-cover" />
                    ) : (
                      <div className="px-2 py-1 flex items-center gap-1.5">
                        <span className="text-base">{att.type === 'file' ? '📄' : '🖼'}</span>
                        <span className="text-xs text-text-lo max-w-[120px] truncate">{att.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => removeAttachment(idx)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input row: [+] [textarea] [send] */}
          <div className="flex items-end gap-2 px-3 py-2.5">

            {/* + button with dropdown */}
            <div className="relative flex-shrink-0 self-end pb-0.5" ref={plusRef}>
              <button
                onClick={() => setPlusOpen((v) => !v)}
                title="Attach or choose a tool"
                aria-label="Open tools menu"
                className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all duration-150"
                style={{
                  borderColor: plusOpen ? 'var(--red-core)' : 'var(--border-hair)',
                  background: plusOpen ? 'var(--red-core)' : 'transparent',
                  color: plusOpen ? '#fff' : 'var(--text-lo)',
                }}
              >
                <PlusIcon open={plusOpen} />
              </button>

              <AnimatePresence>
                {plusOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.14 }}
                    className="absolute bottom-full left-0 mb-2 w-52 bg-bg-panel border border-border-hair rounded-xl shadow-2xl overflow-hidden z-50"
                  >
                    {webEnabled && (
                      <MenuItem
                        icon={<WebIcon />}
                        label="Web Search"
                        active={activeMode === 'web'}
                        onClick={() => toggleMode('web')}
                      />
                    )}
                    {imageEnabled && (
                      <MenuItem
                        icon={<PaletteIcon />}
                        label="Image Generation"
                        active={activeMode === 'image'}
                        onClick={() => toggleMode('image')}
                      />
                    )}
                    <MenuItem
                      icon={<PaperclipIcon />}
                      label="Attach File or Image"
                      onClick={() => { fileInputRef.current?.click(); setPlusOpen(false); }}
                    />
                    <MenuItem
                      icon={<MicIcon listening={isListening} />}
                      label={isListening ? 'Stop Voice Input' : 'Voice Input'}
                      active={isListening}
                      onClick={toggleVoice}
                      badge={isListening ? <span className="w-2 h-2 rounded-full bg-red-core animate-pulse" /> : undefined}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Textarea */}
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

            {/* Send */}
            <motion.button
              onClick={send}
              disabled={!isStreaming && !canSend}
              whileTap={{ scale: 0.92 }}
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150 self-end"
              style={{
                background: isStreaming || canSend ? '#FF1F2E' : '#26262B',
                cursor: isStreaming || canSend ? 'pointer' : 'not-allowed',
              }}
            >
              {isStreaming ? <StopIcon /> : <SendIcon />}
            </motion.button>
          </div>
        </div>

        <p className="text-center text-xs text-text-lo mt-2 opacity-50">
          Enter to send · Shift+Enter for new line
          {isListening && ' · 🎤 Listening…'}
        </p>
      </div>
    </>
  );
}

// ── MenuItem ──────────────────────────────────────────────────────────────────
function MenuItem({
  icon, label, onClick, active = false, badge,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left"
      style={{
        background: active ? 'var(--red-core)11' : 'transparent',
        color: active ? 'var(--red-core)' : 'var(--text-lo)',
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-hi)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = active ? 'var(--red-core)11' : 'transparent'; (e.currentTarget as HTMLElement).style.color = active ? 'var(--red-core)' : 'var(--text-lo)'; }}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge}
    </button>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function PlusIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d={open ? 'M2 2L12 12M12 2L2 12' : 'M7 1V13M1 7H13'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function MicIcon({ listening }: { listening: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke={listening ? '#FF1F2E' : 'currentColor'} strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0014 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="9" y1="22" x2="15" y2="22" />
    </svg>
  );
}
function WebIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function PaletteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="13.5" cy="6.5" r="1" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r="1" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r="1" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12a10 10 0 0010 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}
function PaperclipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
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
