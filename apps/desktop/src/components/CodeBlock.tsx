import { useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const RUNNABLE_LANGS = new Set(['javascript', 'js', 'typescript', 'ts', 'python', 'py']);
const DIFF_LANGS = new Set(['diff', 'patch']);

interface CodeBlockProps {
  language: string;
  code: string;
  runnable?: boolean;
}

export function CodeBlock({ language, code, runnable = true }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const lang = language.toLowerCase();
  const isDiff = DIFF_LANGS.has(lang);
  const canRun = runnable && RUNNABLE_LANGS.has(lang);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  const run = useCallback(() => {
    setRunning(true);
    setOutput(null);
    const workerCode = `
      self.onmessage = function(e) {
        const logs = [];
        const origLog = console.log;
        console.log = (...args) => { logs.push(args.map(String).join(' ')); };
        try {
          const result = eval(e.data);
          console.log = origLog;
          self.postMessage({ ok: true, output: logs.join('\\n') || String(result ?? '') });
        } catch(err) {
          console.log = origLog;
          self.postMessage({ ok: false, output: String(err) });
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    const timer = setTimeout(() => {
      worker.terminate();
      setOutput('⏱ Timed out after 5 s');
      setRunning(false);
    }, 5000);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      setOutput(e.data.output || (e.data.ok ? '(no output)' : e.data.output));
      setRunning(false);
    };
    worker.postMessage(code);
  }, [code]);

  if (isDiff) {
    return (
      <DiffBlock code={code} onCopy={copy} copied={copied} />
    );
  }

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-border-hair bg-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#252526] border-b border-white/5">
        <span className="text-[10px] font-mono text-text-lo uppercase tracking-wider">
          {lang || 'code'}
        </span>
        <div className="flex items-center gap-1.5">
          {canRun && (
            <button
              onClick={run}
              disabled={running}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-green-400 hover:bg-green-400/10 transition-colors disabled:opacity-50"
            >
              {running ? (
                <span className="animate-spin inline-block w-2.5 h-2.5 border border-green-400 border-t-transparent rounded-full" />
              ) : (
                <PlayIcon />
              )}
              Run
            </button>
          )}
          <button
            onClick={copy}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-text-lo hover:text-text-hi hover:bg-white/5 transition-colors"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Code */}
      <SyntaxHighlighter
        language={lang || 'text'}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          padding: '12px 16px',
          background: 'transparent',
          fontSize: '12px',
          lineHeight: '1.6',
        }}
        codeTagProps={{ style: { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" } }}
      >
        {code}
      </SyntaxHighlighter>

      {/* Output panel */}
      {output !== null && (
        <div className="border-t border-white/5 px-4 py-2.5 bg-black/30">
          <p className="text-[9px] text-text-lo uppercase tracking-wider mb-1">Output</p>
          <pre className="text-xs text-green-300 whitespace-pre-wrap break-words font-mono max-h-40 overflow-y-auto">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Diff renderer ─────────────────────────────────────────────────────────────
function DiffBlock({ code, onCopy, copied }: { code: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="my-2 rounded-xl overflow-hidden border border-border-hair bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#252526] border-b border-white/5">
        <span className="text-[10px] font-mono text-text-lo uppercase tracking-wider">diff</span>
        <button
          onClick={onCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-text-lo hover:text-text-hi hover:bg-white/5 transition-colors"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="px-4 py-3 text-xs font-mono overflow-x-auto">
        {code.split('\n').map((line, i) => {
          const cls = line.startsWith('+')
            ? 'bg-green-900/30 text-green-300'
            : line.startsWith('-')
              ? 'bg-red-900/30 text-red-300'
              : line.startsWith('@@')
                ? 'text-blue-300'
                : 'text-text-lo';
          return (
            <div key={i} className={`px-1 leading-relaxed ${cls}`}>
              {line || ' '}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function CopyIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#28C76F" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
