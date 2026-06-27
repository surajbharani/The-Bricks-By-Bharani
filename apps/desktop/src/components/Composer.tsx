import {
  useState, useRef, useEffect, useCallback, type KeyboardEvent,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, type Attachment } from '../store/useSession';
import { useTools } from '../store/useTools';
import { useToast } from '../store/useToast';
import { streamChat } from '../lib/proxyClient';
import { searchWeb, formatResultsAsContext } from '../lib/webSearch';
import { generateImage, IMAGE_MODELS, type ImageModel } from '../lib/imageGen';
import { supabase } from '../lib/supabase';

const PROXY_BASE = import.meta.env.VITE_PROXY_URL ?? 'https://api.nanobricks.app';

// ── PDF / DOCX / CSV extraction ───────────────────────────────────────────────
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
    const buf = await file.arrayBuffer();
    return (await mammoth.extractRawText({ arrayBuffer: buf })).value;
  }
  return (await file.text()).slice(0, 8000);
}

// ── Camera modal ──────────────────────────────────────────────────────────────
function CameraModal({ onCapture, onClose }: { onCapture: (dataUrl: string) => void; onClose: () => void }) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [tab, setTab]     = useState<'camera' | 'screen'>('camera');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const startStream = useCallback(async (mode: 'camera' | 'screen') => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setReady(false); setError('');
    try {
      const stream = mode === 'camera'
        ? await navigator.mediaDevices.getUserMedia({ video: true })
        : await navigator.mediaDevices.getDisplayMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => { videoRef.current!.play(); setReady(true); };
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Permission denied'); }
  }, []);

  useEffect(() => {
    startStream('camera');
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [startStream]);

  const capture = () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}
        className="bg-bg-panel border border-border-hair rounded-2xl p-4 w-[480px] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex bg-bg-elevated rounded-xl p-1 mb-3">
          {(['camera', 'screen'] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); startStream(t); }}
              className="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150"
              style={{ background: tab === t ? 'linear-gradient(135deg,#FF1F2E,#8E0E16)' : 'transparent', color: tab === t ? '#fff' : 'var(--text-lo)' }}>
              {t === 'camera' ? '📷 Camera' : '🖥 Screen'}
            </button>
          ))}
        </div>
        <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
          <video ref={videoRef} muted playsInline className="w-full h-full object-contain" />
          {!ready && !error && <div className="absolute inset-0 flex items-center justify-center text-text-lo text-xs">Starting {tab}…</div>}
          {error && <div className="absolute inset-0 flex items-center justify-center text-red-core text-xs px-4 text-center">{error}</div>}
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <div className="flex gap-2 mt-3">
          <button onClick={capture} disabled={!ready}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-colors duration-150"
            style={{ background: ready ? 'linear-gradient(135deg,#FF1F2E,#8E0E16)' : '#26262B', cursor: ready ? 'pointer' : 'not-allowed' }}>
            Capture
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-text-lo border border-border-hair hover:text-text-hi transition-colors">Cancel</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Image Gen sub-panel ───────────────────────────────────────────────────────
function ImageGenPanel({ onClose, onGenerate }: { onClose: () => void; onGenerate: (prompt: string, model: ImageModel) => void }) {
  const [prompt, setPrompt]   = useState('');
  const [model, setModel]     = useState<ImageModel>('openai/dall-e-3');
  const [loading, setLoading] = useState(false);

  const go = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    await onGenerate(prompt.trim(), model);
    setLoading(false);
    onClose();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
      className="mb-2 bg-bg-elevated border border-border-hair rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">🎨</span>
        <span className="text-xs font-semibold text-text-hi">Image Generation</span>
        <button onClick={onClose} className="ml-auto text-text-lo hover:text-text-hi text-xs">✕</button>
      </div>
      <input autoFocus type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') onClose(); }}
        placeholder="Describe the image you want…"
        className="w-full bg-bg-panel border border-border-hair rounded-lg px-3 py-2 text-sm text-text-hi placeholder-text-lo outline-none focus:border-red-core/40" />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-text-lo">Model:</span>
        {IMAGE_MODELS.map((m) => (
          <button key={m.id} onClick={() => setModel(m.id)}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${model === m.id ? 'border-red-core text-red-core bg-red-core/10' : 'border-border-hair text-text-lo hover:text-text-hi'}`}>
            {m.label}
          </button>
        ))}
        <button onClick={go} disabled={!prompt.trim() || loading}
          className="ml-auto px-3 py-1.5 text-xs bg-red-core text-white rounded-lg hover:bg-red-core/90 disabled:opacity-40 transition-colors">
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </motion.div>
  );
}

// ── Web Search sub-panel ──────────────────────────────────────────────────────
function WebSearchPanel({ onClose, onSearch }: { onClose: () => void; onSearch: (query: string) => void }) {
  const [query, setQuery]     = useState('');
  const [loading, setLoading] = useState(false);

  const go = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    await onSearch(query.trim());
    setLoading(false);
    onClose();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
      className="mb-2 bg-bg-elevated border border-border-hair rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">🔍</span>
        <span className="text-xs font-semibold text-text-hi">Web Search</span>
        <button onClick={onClose} className="ml-auto text-text-lo hover:text-text-hi text-xs">✕</button>
      </div>
      <div className="flex gap-2">
        <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') onClose(); }}
          placeholder="Enter search query…"
          className="flex-1 bg-bg-panel border border-border-hair rounded-lg px-3 py-2 text-sm text-text-hi placeholder-text-lo outline-none focus:border-red-core/40" />
        <button onClick={go} disabled={!query.trim() || loading}
          className="px-3 py-1.5 text-xs bg-red-core text-white rounded-lg hover:bg-red-core/90 disabled:opacity-40 transition-colors">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>
      <p className="text-[10px] text-text-lo">Results will be injected as context before the AI reply</p>
    </motion.div>
  );
}

// ── Main Composer ─────────────────────────────────────────────────────────────
export function Composer() {
  const { mode, agentMode, model, messages, addMessage, appendToMessage, finalizeMessage, setStreaming, isStreaming } = useSession();
  const { isEnabled } = useTools();
  const { addToast, removeToast } = useToast();

  const [text, setText]             = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [plusOpen, setPlusOpen]     = useState(false);
  const [activePanel, setActivePanel] = useState<'web' | 'image' | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [contextPrefix, setContextPrefix] = useState('');

  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const plusRef        = useRef<HTMLDivElement>(null);

  // Close plus menu on outside click
  useEffect(() => {
    if (!plusOpen) return;
    const handler = (e: MouseEvent) => {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) {
        setPlusOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [plusOpen]);

  // Focus composer on Ctrl+L
  useEffect(() => {
    const handler = () => { setText(''); textareaRef.current?.focus(); };
    window.addEventListener('focus-composer', handler);
    return () => window.removeEventListener('focus-composer', handler);
  }, []);

  const placeholder = mode === 'chat'
    ? 'Ask anything…'
    : agentMode === 'swarm'
    ? 'Describe a task — your Team will tackle it in parallel…'
    : 'Describe a task — your agent will plan and execute it…';

  // ── Voice ──────────────────────────────────────────────────────────────────
  const toggleVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { addToast({ message: 'Speech recognition not available in this browser.', type: 'error' }); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList).map((r) => r[0].transcript).join('');
      setText(transcript);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start(); setIsListening(true);
    setPlusOpen(false);
  };

  // ── Image Upload ───────────────────────────────────────────────────────────
  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setAttachments((prev) => [...prev, { type: 'image-upload', name: file.name, dataUrl: reader.result as string, mimeType: file.type }]);
    };
    reader.readAsDataURL(file);
  };

  // ── File Upload ────────────────────────────────────────────────────────────
  const handleDocFile = async (file: File) => {
    try {
      const extracted = await extractFileText(file);
      setAttachments((prev) => [...prev, { type: 'file', name: file.name, text: extracted }]);
    } catch {
      addToast({ message: `Could not read "${file.name}". Try a different file.`, type: 'error' });
    }
  };

  // ── Camera ─────────────────────────────────────────────────────────────────
  const handleCameraCapture = (dataUrl: string) => {
    setAttachments((prev) => [...prev, { type: 'image-upload', name: 'capture.jpg', dataUrl, mimeType: 'image/jpeg' }]);
    setShowCamera(false);
  };

  // ── Web Search ─────────────────────────────────────────────────────────────
  const handleWebSearch = async (query: string) => {
    try {
      const results = await searchWeb(query);
      setContextPrefix(formatResultsAsContext(query, results));
      setAttachments((prev) => [...prev, { type: 'search', name: `Search: ${query}` }]);
    } catch {
      addToast({ message: 'Web search failed. Please try again.', type: 'error' });
    }
  };

  // ── Image Generation ───────────────────────────────────────────────────────
  const handleImageGen = async (prompt: string, imgModel: ImageModel) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const url = await generateImage(prompt, imgModel, token, PROXY_BASE);
      addMessage({ role: 'assistant', content: '', attachments: [{ type: 'image-gen', url, prompt }] });
    } catch (err) {
      addToast({ message: err instanceof Error ? err.message : 'Image generation failed', type: 'error' });
    }
  };

  // ── Copy last reply ────────────────────────────────────────────────────────
  const copyLastReply = () => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.content);
    if (!last) { addToast({ message: 'No assistant reply to copy yet.', type: 'info' }); return; }
    navigator.clipboard.writeText(last.content).then(
      () => addToast({ message: 'Last reply copied to clipboard ✓', type: 'success' }),
      () => addToast({ message: 'Could not access clipboard.', type: 'error' })
    );
    setPlusOpen(false);
  };

  // ── Send ───────────────────────────────────────────────────────────────────
  const send = async () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isStreaming) return;

    const snap = [...attachments];
    const ctx  = contextPrefix;
    setText('');
    setAttachments([]);
    setContextPrefix('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Build file context
    let fileCtx = ctx;
    for (const fa of snap.filter((a) => a.type === 'file')) {
      fileCtx += `[File: ${fa.name}]\n${(fa.text ?? '').slice(0, 6000)}\n---\n\n`;
    }

    const displayAttachments = snap.filter((a) => a.type !== 'file');
    addMessage({ role: 'user', content: trimmed, attachments: displayAttachments.length ? displayAttachments : undefined });

    const fullText = fileCtx + (trimmed || '(see attached)');

    const asstMsgId = addMessage({ role: 'assistant', content: '', streaming: true });
    setStreaming(true);
    const toastId = addToast({ message: 'AI is thinking…', type: 'info', duration: 0 });

    try {
      const historyMsgs = messages
        .filter((m) => !m.streaming && m.content)
        .map((m) => ({ role: m.role, content: m.content }));

      const gen = streamChat({ model, messages: [...historyMsgs, { role: 'user', content: fullText }] });
      for await (const chunk of gen) {
        appendToMessage(asstMsgId, chunk);
      }
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
  };

  const onInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const removeAttachment = (idx: number) => setAttachments((prev) => prev.filter((_, i) => i !== idx));
  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isStreaming;

  const openPanel = (panel: 'web' | 'image') => {
    setActivePanel((p) => p === panel ? null : panel);
    setPlusOpen(false);
  };

  // ── Plus menu items ────────────────────────────────────────────────────────
  const menuItems = [
    { key: 'image-upload', icon: <ImageIcon />, label: 'Upload Image', onClick: () => { imageInputRef.current?.click(); setPlusOpen(false); } },
    { key: 'file',         icon: <FileIcon />,  label: 'Upload File (PDF, DOCX, CSV)', onClick: () => { fileInputRef.current?.click(); setPlusOpen(false); } },
    { key: 'camera',       icon: <CameraIcon />, label: 'Camera / Screenshot', onClick: () => { setShowCamera(true); setPlusOpen(false); } },
    { key: 'mic',          icon: <MicIcon listening={isListening} />, label: isListening ? 'Stop Recording' : 'Voice Input', onClick: toggleVoice },
    ...(isEnabled('web_search')  ? [{ key: 'web',   icon: <WebIcon />,   label: 'Web Search',        onClick: () => openPanel('web')   }] : []),
    ...(isEnabled('image_gen')   ? [{ key: 'imggen', icon: <PaletteIcon />, label: 'Image Generation', onClick: () => openPanel('image') }] : []),
    { key: 'copy',         icon: <CopyIcon />, label: 'Copy Last Reply', onClick: copyLastReply },
  ];

  return (
    <>
      <AnimatePresence>
        {showCamera && <CameraModal onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />}
      </AnimatePresence>

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ''; }} />
      <input ref={fileInputRef} type="file" accept=".pdf,.docx,.csv,.txt" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocFile(f); e.target.value = ''; }} />

      <div className="px-4 pb-4">

        {/* Sub-panels (web search / image gen) */}
        <AnimatePresence>
          {activePanel === 'web'   && <WebSearchPanel   key="web"   onClose={() => setActivePanel(null)} onSearch={handleWebSearch} />}
          {activePanel === 'image' && <ImageGenPanel    key="img"   onClose={() => setActivePanel(null)} onGenerate={handleImageGen} />}
        </AnimatePresence>

        <div className="bg-bg-elevated border border-border-hair rounded-xl focus-within:border-red-core/40 focus-within:shadow-red-glow transition-all duration-200">

          {/* Attachment previews */}
          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="flex flex-wrap gap-2 px-3 pt-3 overflow-hidden">
                {attachments.map((att, idx) => (
                  <div key={idx} className="relative group flex items-center gap-1.5 bg-bg-panel border border-border-hair rounded-lg overflow-hidden">
                    {(att.type === 'image-upload') && att.dataUrl ? (
                      <img src={att.dataUrl} alt={att.name} className="h-14 w-14 object-cover" />
                    ) : (
                      <div className="px-2 py-1 flex items-center gap-1.5">
                        <span className="text-base">{att.type === 'file' ? '📄' : att.type === 'search' ? '🔍' : '🖼'}</span>
                        <span className="text-xs text-text-lo max-w-[120px] truncate">{att.name}</span>
                      </div>
                    )}
                    <button onClick={() => removeAttachment(idx)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      ✕
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input row: [+] [textarea] [send] */}
          <div className="flex items-end gap-2 px-3 py-2.5">

            {/* + button */}
            <div className="relative flex-shrink-0 self-end pb-0.5" ref={plusRef}>
              <button
                onClick={() => { setPlusOpen((v) => !v); setActivePanel(null); }}
                title="Attach / tools"
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-border-hair transition-all duration-150"
                style={{
                  background: plusOpen ? '#FF1F2E22' : 'transparent',
                  color: plusOpen ? '#FF1F2E' : 'var(--text-lo)',
                }}
              >
                <PlusIcon open={plusOpen} />
              </button>

              {/* Dropdown menu */}
              <AnimatePresence>
                {plusOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-2 w-56 bg-bg-panel border border-border-hair rounded-xl shadow-2xl overflow-hidden z-50"
                  >
                    {menuItems.map((item) => (
                      <button key={item.key} onClick={item.onClick}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-text-lo hover:text-text-hi hover:bg-bg-elevated transition-colors text-left">
                        <span className="text-text-lo flex-shrink-0">{item.icon}</span>
                        <span>{item.label}</span>
                        {item.key === 'mic' && isListening && (
                          <span className="ml-auto w-2 h-2 rounded-full bg-red-core animate-pulse" />
                        )}
                      </button>
                    ))}
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

            {/* Send / Stop */}
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
              {isStreaming ? <StopIconSvg /> : <SendIcon />}
            </motion.button>
          </div>
        </div>

        <p className="text-center text-xs text-text-lo mt-2 opacity-50">
          Enter to send · Shift+Enter for new line{isListening && ' · 🎤 Listening…'}
          {contextPrefix && ' · 🔍 Search context ready'}
        </p>
      </div>
    </>
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
function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function WebIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
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
function StopIconSvg() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="1" y="1" width="8" height="8" rx="1" fill="#F4F4F6" />
    </svg>
  );
}
