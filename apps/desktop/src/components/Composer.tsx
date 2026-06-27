import {
  useState, useRef, useEffect, useCallback, type KeyboardEvent, type ReactNode,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, type Attachment, type ResponseLength, type WebSource } from '../store/useSession';
import { useToast } from '../store/useToast';
import { streamChat, modelSupportsVision, type ContentBlock } from '../lib/proxyClient';
import { useProjects } from '../store/useProjects';
import { useMemory } from '../store/useMemory';
import { useTools } from '../store/useTools';
import { searchWeb, formatResultsAsContext } from '../lib/webSearch';
import { generateImage, IMAGE_MODELS, type ImageModel } from '../lib/imageGen';

import {
  googleSearch, youtubeSearch,
  formatSearchContext, formatYouTubeContext,
  hasGoogleSearch, hasYouTubeSearch,
} from '../lib/search';

// Static ?url import so Vite bundles the worker file and rewrites the path correctly
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// ── PDF / DOCX / CSV extraction ───────────────────────────────────────────────
async function extractPdf(file: File): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
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

async function extractDocx(file: File): Promise<string> {
  // Vite wraps CJS packages — default export lives at .default
  const mod = await import('mammoth');
  const mammoth = (mod.default ?? mod) as { extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value;
}

async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf'))  return extractPdf(file);
  if (name.endsWith('.docx')) return extractDocx(file);
  // CSV / TXT — pass raw text, capped at 8 000 chars
  return (await file.text()).slice(0, 8000);
}

// ── Camera modal ──────────────────────────────────────────────────────────────
function CameraModal({
  onCapture,
  onClose,
}: {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [tab, setTab]   = useState<'camera' | 'screen'>('camera');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const startStream = useCallback(async (mode: 'camera' | 'screen') => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setReady(false);
    setError('');
    try {
      const stream =
        mode === 'camera'
          ? await navigator.mediaDevices.getUserMedia({ video: true })
          : await navigator.mediaDevices.getDisplayMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current!.play();
          setReady(true);
        };
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permission denied');
    }
  }, []);

  useEffect(() => {
    startStream('camera');
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [startStream]);

  const switchTab = (t: 'camera' | 'screen') => {
    setTab(t);
    startStream(t);
  };

  const capture = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(dataUrl);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-bg-panel border border-border-hair rounded-2xl p-4 w-[480px] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabs */}
        <div className="flex bg-bg-elevated rounded-xl p-1 mb-3">
          {(['camera', 'screen'] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 font-display"
              style={{
                background: tab === t ? 'linear-gradient(135deg,#FF1F2E,#8E0E16)' : 'transparent',
                color: tab === t ? '#fff' : 'var(--text-lo)',
              }}
            >
              {t === 'camera' ? '📷 Camera' : '🖥 Screen'}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div
          className="relative bg-black rounded-xl overflow-hidden"
          style={{ aspectRatio: '16/9' }}
        >
          <video ref={videoRef} muted playsInline className="w-full h-full object-contain" />
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-text-lo text-xs">
              Starting {tab}…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-red-core text-xs px-4 text-center">
              {error}
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        {/* Buttons */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={capture}
            disabled={!ready}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-colors duration-150"
            style={{
              background: ready ? 'linear-gradient(135deg,#FF1F2E,#8E0E16)' : '#26262B',
              cursor: ready ? 'pointer' : 'not-allowed',
            }}
          >
            Capture
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-text-lo border border-border-hair hover:text-text-hi transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Composer ─────────────────────────────────────────────────────────────
export function Composer() {
  const {
    mode, agentMode, model,
    messages,
    addMessage, appendToMessage, appendReasoning, updateMessage, finalizeMessage, setStreaming, isStreaming,
    updateCanvas,
    responseLength, setResponseLength,
    regeneratePayload, setRegeneratePayload,
  } = useSession();

  const [showLengthMenu, setShowLengthMenu] = useState(false);
  const lengthMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showLengthMenu) return;
    const handler = (e: MouseEvent) => {
      if (lengthMenuRef.current && !lengthMenuRef.current.contains(e.target as Node)) {
        setShowLengthMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLengthMenu]);

  const { projects, activeProjectId } = useProjects();
  const { settings: memSettings, facts } = useMemory();
  const { addToast, removeToast } = useToast();
  const { isEnabled } = useTools();
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const [text, setText]             = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [googleOn, setGoogleOn]     = useState(false);
  const [youtubeOn, setYoutubeOn]   = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [visionWarn, setVisionWarn] = useState(false);
  const [activeMode, setActiveMode] = useState<'web' | 'image' | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [imgModel, setImgModel] = useState<ImageModel>('openai/dall-e-3');
  const plusMenuRef = useRef<HTMLDivElement>(null);

  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const abortRef       = useRef<AbortController | null>(null);

  const placeholder =
    mode === 'chat'
      ? 'Ask anything…'
      : agentMode === 'swarm'
      ? 'Describe a task — your Team will tackle it in parallel…'
      : 'Describe a task — your agent will plan and execute it…';

  // Focus composer on Ctrl+L global shortcut
  useEffect(() => {
    const handler = () => {
      setText('');
      textareaRef.current?.focus();
    };
    window.addEventListener('focus-composer', handler);
    return () => window.removeEventListener('focus-composer', handler);
  }, []);

  // Show vision warning when image is attached and model doesn't support it
  useEffect(() => {
    const hasImage = attachments.some((a) => a.type === 'image');
    setVisionWarn(hasImage && !modelSupportsVision(model));
  }, [attachments, model]);

  // Close plus menu on outside click
  useEffect(() => {
    if (!showPlusMenu) return;
    const handler = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) setShowPlusMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPlusMenu]);

  // ESC dismisses active mode
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setActiveMode(null); setShowPlusMenu(false); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Voice Input ─────────────────────────────────────────────────────────────
  const toggleVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Speech recognition is not available in this environment.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const rec = new SR();
    rec.continuous      = false;
    rec.interimResults  = true;
    rec.lang            = 'en-US';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList)
        .map((r) => r[0].transcript)
        .join('');
      setText(transcript);
    };
    rec.onend   = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  };

  // ── Image Upload ────────────────────────────────────────────────────────────
  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setAttachments((prev) => [
        ...prev,
        { type: 'image', name: file.name, dataUrl: reader.result as string, mimeType: file.type },
      ]);
    };
    reader.readAsDataURL(file);
  };

  // ── File Upload ─────────────────────────────────────────────────────────────
  const handleDocFile = async (file: File) => {
    try {
      const extracted = await extractFileText(file);
      setAttachments((prev) => [
        ...prev,
        { type: 'file', name: file.name, text: extracted },
      ]);
    } catch {
      alert(`Could not read "${file.name}". Try a different file.`);
    }
  };

  // ── Camera Capture ──────────────────────────────────────────────────────────
  const handleCameraCapture = (dataUrl: string) => {
    setAttachments((prev) => [
      ...prev,
      { type: 'image', name: 'capture.jpg', dataUrl, mimeType: 'image/jpeg' },
    ]);
    setShowCamera(false);
  };

  // ── Save last AI reply to Canvas ────────────────────────────────────────────
  const saveToCanvas = () => {
    const lastAsst = [...messages].reverse().find((m) => m.role === 'assistant' && m.content);
    if (!lastAsst) return;
    updateCanvas({ content: lastAsst.content });
  };

  // ── Stop streaming ───────────────────────────────────────────────────────────
  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  // ── Regenerate watcher ───────────────────────────────────────────────────────
  useEffect(() => {
    if (regeneratePayload) {
      setRegeneratePayload(null);
      sendWithText(regeneratePayload);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regeneratePayload]);

  // ── Internal send for regenerate / editAndResend ─────────────────────────────
  const sendWithText = async (forcedText: string) => {
    if (isStreaming) return;
    const trimmed = forcedText.trim();
    if (!trimmed) return;

    const latestMsgs = messages.filter((m) => !m.streaming);
    const lastMsg = latestMsgs[latestMsgs.length - 1];
    if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== trimmed) {
      addMessage({ role: 'user', content: trimmed });
    }

    const systemParts: string[] = [];
    const lengthHint: Record<string, string> = {
      short: 'Keep your response brief and concise (1–3 short paragraphs or less).',
      medium: 'Give a moderately detailed response (3–6 paragraphs).',
      long: 'Give a thorough, comprehensive response with full detail.',
    };
    if (lengthHint[responseLength]) systemParts.push(lengthHint[responseLength]);
    if (memSettings.globalSystemPrompt) systemParts.push(memSettings.globalSystemPrompt);
    if (memSettings.memoryEnabled && facts.length) {
      systemParts.push(`[What I remember about you]\n${facts.map((f) => `- ${f.text}`).join('\n')}`);
    }
    if (activeProject?.systemPrompt) systemParts.push(activeProject.systemPrompt);
    if (activeProject?.memory) systemParts.push(`[Project memory]\n${activeProject.memory}`);
    if (activeProject?.files && activeProject.files.length > 0) {
      systemParts.push(activeProject.files.map((f) => `[File: ${f.name}]\n${f.text}`).join('\n\n'));
    }

    const allHistory = latestMsgs
      .filter((m) => m.content)
      .map((m) => ({ role: m.role, content: m.content }));
    const historyMsgs = allHistory[allHistory.length - 1]?.role === 'user'
      ? allHistory.slice(0, -1)
      : allHistory;

    const systemMsg = systemParts.length > 0
      ? [{ role: 'system' as const, content: systemParts.join('\n\n') }]
      : [];

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const asstMsgId = addMessage({ role: 'assistant', content: '', streaming: true });
    setStreaming(true);
    const thinkingToastIdSWT = addToast({ message: 'AI is thinking…', type: 'info', duration: 0 });
    let swtErrored = false;

    try {
      const gen = streamChat({
        model,
        messages: [...systemMsg, ...historyMsgs, { role: 'user', content: trimmed }],
        signal: ctrl.signal,
      });
      for await (const chunk of gen) {
        if (ctrl.signal.aborted) break;
        if (chunk.kind === 'reasoning') {
          appendReasoning(asstMsgId, chunk.text);
        } else {
          appendToMessage(asstMsgId, chunk.text);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        swtErrored = true;
        appendToMessage(asstMsgId, `\n\n*Error: ${err.message}*`);
        removeToast(thinkingToastIdSWT);
        addToast({ message: 'Something went wrong. Please try again.', type: 'error', duration: 5000 });
      }
    } finally {
      finalizeMessage(asstMsgId);
      setStreaming(false);
      abortRef.current = null;
      removeToast(thinkingToastIdSWT);
      if (!swtErrored && !ctrl.signal.aborted) {
        addToast({ message: 'Response ready', type: 'success', duration: 2500 });
      }
    }
  };

  const send = async () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isStreaming) return;

    // ── Web search mode ──────────────────────────────────────────────────────
    if (activeMode === 'web' && trimmed) {
      setActiveMode(null);
      setText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      addMessage({ role: 'user', content: trimmed });
      const asstMsgId = addMessage({
        role: 'assistant', content: '', streaming: true,
        attachments: [{ type: 'web-search', webStatus: 'searching', query: trimmed, sources: [] }],
      });
      setStreaming(true);
      let sources: WebSource[] = [];
      try {
        await new Promise((r) => setTimeout(r, 500));
        updateMessage(asstMsgId, { attachments: [{ type: 'web-search', webStatus: 'reading', query: trimmed, sources: [] }] });
        const results = await searchWeb(trimmed);
        sources = results as WebSource[];
        updateMessage(asstMsgId, { attachments: [{ type: 'web-search', webStatus: 'answering', query: trimmed, sources }] });
        await new Promise((r) => setTimeout(r, 200));
        const context = formatResultsAsContext(trimmed, results);
        const histMsgs = messages.filter((m) => !m.streaming && m.content).map((m) => ({ role: m.role, content: m.content }));
        const gen = streamChat({ model, messages: [...histMsgs, { role: 'user', content: context }] });
        for await (const chunk of gen) appendToMessage(asstMsgId, chunk.text);
      } catch (err) {
        appendToMessage(asstMsgId, `\n\n*Search error: ${err instanceof Error ? err.message : 'Unknown error'}*`);
      } finally {
        updateMessage(asstMsgId, { streaming: false, attachments: [{ type: 'web-search', webStatus: 'done', query: trimmed, sources }] });
        finalizeMessage(asstMsgId);
        setStreaming(false);
      }
      return;
    }

    // ── Image generation mode ────────────────────────────────────────────────
    if (activeMode === 'image' && trimmed) {
      setActiveMode(null);
      setText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      addMessage({ role: 'user', content: trimmed });
      const asstMsgId = addMessage({ role: 'assistant', content: 'Generating image…', streaming: true });
      setStreaming(true);
      try {
        const PROXY_BASE = import.meta.env.VITE_PROXY_URL ?? 'https://api.nanobricks.app';
        const url = await generateImage(trimmed, imgModel, '', PROXY_BASE);
        updateMessage(asstMsgId, {
          content: '',
          streaming: false,
          attachments: [{ type: 'image-gen', url, prompt: trimmed }],
        });
      } catch (err) {
        updateMessage(asstMsgId, { content: `*Image generation failed: ${err instanceof Error ? err.message : 'Unknown error'}*`, streaming: false });
      } finally {
        finalizeMessage(asstMsgId);
        setStreaming(false);
      }
      return;
    }

    // Snapshot attachments before clearing state
    const snap = [...attachments];
    setText('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Build context prefix from search results
    let contextPrefix = '';
    if ((googleOn || youtubeOn) && trimmed) {
      setIsSearching(true);
      const [gResults, ytResults] = await Promise.all([
        googleOn  ? googleSearch(trimmed)  : Promise.resolve([]),
        youtubeOn ? youtubeSearch(trimmed) : Promise.resolve([]),
      ]);
      setIsSearching(false);
      if (gResults.length)  contextPrefix += formatSearchContext(gResults, trimmed);
      if (ytResults.length) contextPrefix += formatYouTubeContext(ytResults, trimmed);
    }

    // Build file context prefix from snapshotted attachments
    for (const fa of snap.filter((a) => a.type === 'file')) {
      contextPrefix += `[File: ${fa.name}]\n${(fa.text ?? '').slice(0, 6000)}\n---\n\n`;
    }

    // Attachment badges shown in the chat bubble
    const displayAttachments: Attachment[] = [...snap];
    if (googleOn  && trimmed) displayAttachments.push({ type: 'search',  name: 'Google Search' });
    if (youtubeOn && trimmed) displayAttachments.push({ type: 'youtube', name: 'YouTube Search' });

    // Add user message to store for display
    addMessage({
      role: 'user',
      content: trimmed,
      attachments: displayAttachments.length ? displayAttachments : undefined,
    });

    // Build API content — multimodal when images present
    const imageSnap = snap.filter((a) => a.type === 'image' && a.dataUrl);
    const fullText  = contextPrefix + (trimmed || '(see attached image)');

    let apiContent: string | ContentBlock[];
    if (imageSnap.length > 0) {
      const blocks: ContentBlock[] = imageSnap.map((img) => ({
        type: 'image_url' as const,
        image_url: { url: img.dataUrl! },
      }));
      blocks.push({ type: 'text', text: fullText });
      apiContent = blocks;
    } else {
      apiContent = fullText;
    }

    // Create abort controller for this request
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const asstMsgId = addMessage({ role: 'assistant', content: '', streaming: true });
    setStreaming(true);
    const thinkingToastId = addToast({ message: 'AI is thinking…', type: 'info', duration: 0 });
    let sendErrored = false;

    // Build system context (global instructions + memory + project)
    const systemParts: string[] = [];
    const lengthHint: Record<string, string> = {
      short: 'Keep your response brief and concise (1–3 short paragraphs or less).',
      medium: 'Give a moderately detailed response (3–6 paragraphs).',
      long: 'Give a thorough, comprehensive response with full detail.',
    };
    if (lengthHint[responseLength]) systemParts.push(lengthHint[responseLength]);
    if (memSettings.globalSystemPrompt) systemParts.push(memSettings.globalSystemPrompt);
    if (memSettings.memoryEnabled && facts.length) {
      systemParts.push(`[What I remember about you]\n${facts.map((f) => `- ${f.text}`).join('\n')}`);
    }
    if (activeProject?.systemPrompt) systemParts.push(activeProject.systemPrompt);
    if (activeProject?.memory) systemParts.push(`[Project memory]\n${activeProject.memory}`);
    if (activeProject?.files && activeProject.files.length > 0) {
      systemParts.push(activeProject.files.map((f) => `[File: ${f.name}]\n${f.text}`).join('\n\n'));
    }

    // Build full conversation history for context (finalized messages only, no images in history)
    const historyMsgs = messages
      .filter((m) => !m.streaming && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    const systemMsg = systemParts.length > 0
      ? [{ role: 'system' as const, content: systemParts.join('\n\n') }]
      : [];

    try {
      const gen = streamChat({
        model,
        messages: [...systemMsg, ...historyMsgs, { role: 'user', content: apiContent }],
        signal: ctrl.signal,
      });
      for await (const chunk of gen) {
        if (ctrl.signal.aborted) break;
        if (chunk.kind === 'reasoning') {
          appendReasoning(asstMsgId, chunk.text);
        } else {
          appendToMessage(asstMsgId, chunk.text);
        }
      }
    } catch (err) {
      // Ignore AbortError — user pressed stop intentionally
      if (err instanceof Error && err.name !== 'AbortError') {
        sendErrored = true;
        appendToMessage(asstMsgId, `\n\n*Error: ${err.message}*`);
        removeToast(thinkingToastId);
        addToast({ message: 'Something went wrong. Please try again.', type: 'error', duration: 5000 });
      }
    } finally {
      finalizeMessage(asstMsgId);
      setStreaming(false);
      abortRef.current = null;
      removeToast(thinkingToastId);
      // Only show success toast if not aborted and no error
      if (!sendErrored && !ctrl.signal.aborted) {
        addToast({ message: 'Response ready', type: 'success', duration: 2500 });
      }
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

  const removeAttachment = (idx: number) =>
    setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isStreaming && !(activeMode && !text.trim());

  return (
    <>
      <AnimatePresence>
        {showCamera && (
          <CameraModal onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
        )}
      </AnimatePresence>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ''; }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.csv,.txt"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocFile(f); e.target.value = ''; }}
      />

      <div className="px-4 pb-4">
        {/* Vision warning */}
        <AnimatePresence>
          {visionWarn && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs text-amber-400 mb-1.5 px-1"
            >
              ⚠ Current model may not support images. Switch to Owl Alpha or GPT-4o for vision.
            </motion.p>
          )}
        </AnimatePresence>

        <div className="bg-bg-elevated border border-border-hair rounded-xl focus-within:border-red-core/40 focus-within:shadow-red-glow transition-all duration-200">

          {/* Attachment previews */}
          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex flex-wrap gap-2 px-3 pt-3 overflow-hidden"
              >
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="relative group flex items-center gap-1.5 bg-bg-panel border border-border-hair rounded-lg overflow-hidden"
                  >
                    {att.type === 'image' && att.dataUrl ? (
                      <img src={att.dataUrl} alt={att.name} className="h-14 w-14 object-cover" />
                    ) : (
                      <div className="px-2 py-1 flex items-center gap-1.5">
                        <span className="text-base">
                          {att.type === 'file' ? '📄' : att.type === 'search' ? '🔍' : '▶'}
                        </span>
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

          {/* Textarea */}
          <div className="px-3 pt-2.5">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              onInput={onInput}
              placeholder={placeholder}
              rows={1}
              disabled={isStreaming}
              className="w-full resize-none bg-transparent text-sm text-text-hi placeholder-text-lo outline-none leading-relaxed"
              style={{ fontFamily: 'var(--display)', maxHeight: '160px' }}
            />
          </div>

          {/* Toolbar row */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
            {/* Left: tool buttons */}
            <div className="flex items-center gap-1">
              {/* + button with dropdown */}
              <div className="relative" ref={plusMenuRef}>
                <button
                  aria-label="Open tools menu"
                  onClick={() => setShowPlusMenu((v) => !v)}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-text-lo hover:text-text-hi transition-colors"
                  style={{ background: showPlusMenu ? '#FF1F2E22' : 'transparent', color: showPlusMenu ? '#FF1F2E' : undefined }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
                  </svg>
                </button>
                <AnimatePresence>
                  {showPlusMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.12 }}
                      className="absolute bottom-full mb-2 left-0 bg-bg-panel border border-border-hair rounded-xl shadow-xl z-30 overflow-hidden min-w-[180px]"
                    >
                      {isEnabled('web_search') && (
                        <button
                          onClick={() => { setActiveMode(activeMode === 'web' ? null : 'web'); setShowPlusMenu(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-lo hover:text-text-hi hover:bg-bg-elevated transition-colors"
                        >
                          <span>🔍</span><span>Web Search</span>
                        </button>
                      )}
                      {isEnabled('image_gen') && (
                        <button
                          onClick={() => { setActiveMode(activeMode === 'image' ? null : 'image'); setShowPlusMenu(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-lo hover:text-text-hi hover:bg-bg-elevated transition-colors"
                        >
                          <span>🎨</span><span>Image Generation</span>
                        </button>
                      )}
                      {isEnabled('code_runner') && (
                        <div className="px-3 py-2 text-xs text-text-lo opacity-50">▶ Code Runner — click ▶ in code blocks</div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Mode pill */}
              <AnimatePresence>
                {activeMode && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium"
                    style={{ borderColor: '#FF1F2E44', background: '#FF1F2E11', color: '#FF1F2E' }}
                  >
                    {activeMode === 'web' ? '🔍 Web Search mode' : '🎨 Image Generation mode'}
                    {activeMode === 'image' && (
                      <select
                        value={imgModel}
                        onChange={(e) => setImgModel(e.target.value as ImageModel)}
                        className="ml-1 text-[10px] bg-transparent border-none outline-none cursor-pointer"
                        style={{ color: '#FF1F2E' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {IMAGE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    )}
                    <button onClick={() => setActiveMode(null)} className="ml-1 opacity-60 hover:opacity-100">✕</button>
                  </motion.div>
                )}
              </AnimatePresence>

              <ToolBtn
                title={isListening ? 'Stop listening' : 'Voice input (mic)'}
                active={isListening}
                onClick={toggleVoice}
              >
                <MicIcon listening={isListening} />
              </ToolBtn>

              <ToolBtn title="Upload image" onClick={() => imageInputRef.current?.click()}>
                <ImageIcon />
              </ToolBtn>

              <ToolBtn title="Upload file (PDF, DOCX, CSV)" onClick={() => fileInputRef.current?.click()}>
                <FileIcon />
              </ToolBtn>

              <ToolBtn title="Camera / screenshot" onClick={() => setShowCamera(true)}>
                <CameraIcon />
              </ToolBtn>

              <ToolBtn
                title="Save last reply to Canvas"
                onClick={saveToCanvas}
                dim={!messages.some((m) => m.role === 'assistant')}
              >
                <CanvasIcon />
              </ToolBtn>

              <div className="w-px h-4 bg-border-hair mx-1" />

              <ToolBtn
                title={hasGoogleSearch ? 'Google Search (click to toggle)' : 'Google Search — add GOOGLE_SEARCH_KEY secret to enable'}
                active={googleOn}
                onClick={() => { if (hasGoogleSearch) setGoogleOn((v) => !v); }}
                dim={!hasGoogleSearch}
              >
                <GoogleIcon />
              </ToolBtn>

              <ToolBtn
                title={hasYouTubeSearch ? 'YouTube Search (click to toggle)' : 'YouTube Search — add YOUTUBE_KEY secret to enable'}
                active={youtubeOn}
                onClick={() => { if (hasYouTubeSearch) setYoutubeOn((v) => !v); }}
                dim={!hasYouTubeSearch}
              >
                <YouTubeIcon />
              </ToolBtn>

              {isSearching && (
                <span className="text-xs text-text-lo animate-pulse ml-1">Searching…</span>
              )}
            </div>

            {/* Right: length pill + send / stop button */}
            <div className="flex items-center gap-1.5">
              {/* Response length pill */}
              <div className="relative" ref={lengthMenuRef}>
                <button
                  onClick={() => setShowLengthMenu((v) => !v)}
                  className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium text-text-lo hover:text-text-hi border border-border-hair hover:border-red-core/30 transition-colors"
                >
                  {responseLength === 'auto' ? 'Auto' : responseLength.charAt(0).toUpperCase() + responseLength.slice(1)}
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M4 5.5L1 2.5h6L4 5.5z"/></svg>
                </button>
                {showLengthMenu && (
                  <div className="absolute bottom-full mb-1 right-0 bg-bg-panel border border-border-hair rounded-xl overflow-hidden shadow-xl z-20 min-w-[90px]">
                    {(['auto', 'short', 'medium', 'long'] as ResponseLength[]).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => { setResponseLength(opt); setShowLengthMenu(false); }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${responseLength === opt ? 'text-red-core bg-red-core/10' : 'text-text-lo hover:text-text-hi hover:bg-bg-elevated'}`}
                      >
                        {opt.charAt(0).toUpperCase() + opt.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

            <motion.button
              onClick={isStreaming ? stopStreaming : send}
              disabled={!isStreaming && !canSend}
              whileTap={{ scale: 0.92 }}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150 flex-shrink-0"
              style={{
                background: isStreaming ? '#FF1F2E' : canSend ? '#FF1F2E' : '#26262B',
                cursor: (isStreaming || canSend) ? 'pointer' : 'not-allowed',
              }}
            >
              {isStreaming ? <StopIcon /> : <SendIcon />}
            </motion.button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-text-lo mt-2 opacity-50">
          Enter to send · Shift+Enter for new line
          {(googleOn || youtubeOn) && ' · Search ON'}
          {isListening && ' · 🎤 Listening…'}
        </p>
      </div>
    </>
  );
}

// ── Small toolbar button ──────────────────────────────────────────────────────
function ToolBtn({
  children, onClick, title, active = false, dim = false,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  dim?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded-md flex items-center justify-center transition-all duration-150"
      style={{
        background: active ? '#FF1F2E22' : 'transparent',
        opacity: dim ? 0.35 : 1,
        color: active ? '#FF1F2E' : 'var(--text-lo)',
      }}
      onMouseEnter={(e) => { if (!dim) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-hi)'; }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = active ? '#FF1F2E' : 'var(--text-lo)';
      }}
    >
      {children}
    </button>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function GoogleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
function YouTubeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2 31.1 31.1 0 000 12a31.1 31.1 0 00.5 5.8 3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1A31.1 31.1 0 0024 12a31.1 31.1 0 00-.5-5.8zM9.75 15.5v-7l6.25 3.5-6.25 3.5z"/>
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
function CanvasIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
