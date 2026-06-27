import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const RUNNABLE_LANGS = new Set(['python', 'py', 'javascript', 'js', 'bash', 'sh', 'node']);

interface Props {
  lang: string;
  code: string;
}

export function CodeRunner({ lang, code }: Props) {
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);

  const normalizedLang = lang.toLowerCase();
  if (!IS_TAURI || !RUNNABLE_LANGS.has(normalizedLang)) return null;

  const run = async () => {
    setRunning(true);
    setOpen(true);
    setOutput(null);
    try {
      const result = await invoke<string>('run_code', { lang: normalizedLang, code });
      setOutput(result || '(no output)');
    } catch (err) {
      setOutput(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mt-1">
      <button
        onClick={run}
        disabled={running}
        className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-md border border-border-hair text-text-lo hover:text-text-hi hover:border-red-core/40 transition-colors disabled:opacity-50"
      >
        {running ? (
          <span className="inline-block w-2 h-2 rounded-full bg-red-core animate-pulse" />
        ) : (
          <span className="text-ok">▶</span>
        )}
        {running ? 'Running…' : 'Run'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-lg border border-border-hair bg-bg-void p-3 relative">
              <button
                onClick={() => setOpen(false)}
                className="absolute top-2 right-2 text-text-lo hover:text-text-hi text-xs"
                aria-label="Close output"
              >
                ✕
              </button>
              <p className="text-[10px] text-text-lo mb-1 font-mono uppercase tracking-wide">Output</p>
              {output === null ? (
                <p className="text-xs text-text-lo">Running…</p>
              ) : (
                <pre className="text-xs font-mono text-text-hi whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                  {output}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
