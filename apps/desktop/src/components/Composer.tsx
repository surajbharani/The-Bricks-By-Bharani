import { useState, useRef, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '../store/useSession';
import { useTools } from '../store/useTools';
import { useToast } from '../store/useToast';
import { streamChat } from '../lib/proxyClient';
import { searchWeb, formatResultsAsContext } from '../lib/webSearch';
import { generateImage, IMAGE_MODELS, type ImageModel } from '../lib/imageGen';
import { supabase } from '../lib/supabase';

const PROXY_BASE = import.meta.env.VITE_PROXY_URL ?? 'https://api.nanobricks.app';

export function Composer() {
  const { mode, agentMode, model, addMessage, appendToMessage, finalizeMessage, setStreaming, isStreaming } =
    useSession();
  const { isEnabled } = useTools();
  const { addToast } = useToast();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Web search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  // Image gen state
  const [showImageGen, setShowImageGen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageModel, setImageModel] = useState<ImageModel>('openai/dall-e-3');
  const [generatingImage, setGeneratingImage] = useState(false);

  const placeholder =
    mode === 'chat'
      ? 'Ask anything…'
      : agentMode === 'swarm'
      ? 'Describe a task — your Team of agents will tackle it in parallel…'
      : 'Describe a task — your agent will plan and execute it step by step…';

  const send = async (extraContext?: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMsgId = addMessage({ role: 'user', content: trimmed });
    void userMsgId;

    const asstMsgId = addMessage({ role: 'assistant', content: '', streaming: true });
    setStreaming(true);

    try {
      const messages: Array<{ role: string; content: string }> = [];
      if (extraContext) {
        messages.push({ role: 'system', content: extraContext });
      }
      messages.push({ role: 'user', content: trimmed });

      const gen = streamChat({ model, messages });
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

  const handleWebSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchWeb(searchQuery.trim());
      const context = formatResultsAsContext(searchQuery.trim(), results);
      setShowSearch(false);
      setSearchQuery('');
      await send(context);
    } catch {
      addToast({ message: 'Web search failed. Please try again.', type: 'error' });
    } finally {
      setSearching(false);
    }
  };

  const handleImageGen = async () => {
    if (!imagePrompt.trim()) return;
    setGeneratingImage(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const url = await generateImage(imagePrompt.trim(), imageModel, token, PROXY_BASE);
      addMessage({
        role: 'assistant',
        content: '',
        attachments: [{ type: 'image', url, prompt: imagePrompt.trim() }],
      });
      setShowImageGen(false);
      setImagePrompt('');
    } catch (err) {
      addToast({ message: err instanceof Error ? err.message : 'Image generation failed', type: 'error' });
    } finally {
      setGeneratingImage(false);
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

  const webEnabled   = isEnabled('web_search');
  const imageEnabled = isEnabled('image_gen');
  const hasTools = webEnabled || imageEnabled;

  return (
    <div className="px-4 pb-4 space-y-2">
      {/* Web search panel */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 bg-bg-elevated border border-border-hair rounded-xl px-3 py-2">
              <span className="text-xs text-text-lo flex-shrink-0">🔍 Search:</span>
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleWebSearch();
                  if (e.key === 'Escape') setShowSearch(false);
                }}
                placeholder="Enter search query…"
                className="flex-1 bg-transparent text-sm text-text-hi placeholder-text-lo outline-none"
              />
              <button
                onClick={handleWebSearch}
                disabled={!searchQuery.trim() || searching}
                className="px-3 py-1 text-xs bg-red-core text-white rounded-lg hover:bg-red-core/90 transition-colors disabled:opacity-40"
              >
                {searching ? 'Searching…' : 'Search'}
              </button>
              <button onClick={() => setShowSearch(false)} className="text-text-lo hover:text-text-hi text-xs">✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image gen panel */}
      <AnimatePresence>
        {showImageGen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-bg-elevated border border-border-hair rounded-xl px-3 py-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-lo flex-shrink-0">🎨 Generate:</span>
                <input
                  autoFocus
                  type="text"
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleImageGen();
                    if (e.key === 'Escape') setShowImageGen(false);
                  }}
                  placeholder="Describe the image you want…"
                  className="flex-1 bg-transparent text-sm text-text-hi placeholder-text-lo outline-none"
                />
                <button onClick={() => setShowImageGen(false)} className="text-text-lo hover:text-text-hi text-xs">✕</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-lo">Model:</span>
                {IMAGE_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setImageModel(m.id)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      imageModel === m.id
                        ? 'border-red-core text-red-core bg-red-core/10'
                        : 'border-border-hair text-text-lo hover:text-text-hi'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
                <button
                  onClick={handleImageGen}
                  disabled={!imagePrompt.trim() || generatingImage}
                  className="ml-auto px-3 py-1 text-xs bg-red-core text-white rounded-lg hover:bg-red-core/90 transition-colors disabled:opacity-40"
                >
                  {generatingImage ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tool buttons row */}
      {hasTools && (
        <div className="flex items-center gap-1.5 px-1">
          {webEnabled && (
            <button
              onClick={() => { setShowSearch((v) => !v); setShowImageGen(false); }}
              title="Web Search"
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors ${
                showSearch
                  ? 'border-red-core text-red-core bg-red-core/10'
                  : 'border-border-hair text-text-lo hover:text-text-hi'
              }`}
            >
              🔍 <span>Web</span>
            </button>
          )}
          {imageEnabled && (
            <button
              onClick={() => { setShowImageGen((v) => !v); setShowSearch(false); }}
              title="Image Generation"
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors ${
                showImageGen
                  ? 'border-red-core text-red-core bg-red-core/10'
                  : 'border-border-hair text-text-lo hover:text-text-hi'
              }`}
            >
              🎨 <span>Image</span>
            </button>
          )}
        </div>
      )}

      {/* Main input */}
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
          onClick={() => send()}
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
      <p className="text-center text-xs text-text-lo mt-1 opacity-50">
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
