import { useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSession } from '../store/useSession';
import { CanvasToolbar, type CanvasViewMode } from './CanvasToolbar';

export function Canvas() {
  const { canvas, updateCanvas, setShowCanvas } = useSession();
  const [viewMode, setViewMode] = useState<CanvasViewMode>('edit');
  const [codeOutputs, setCodeOutputs] = useState<Map<string, string>>(new Map());
  const workerRef = useRef<Worker | null>(null);

  const runPython = useCallback((code: string, key: string) => {
    setCodeOutputs((m) => new Map(m).set(key, '⏳ Running…'));

    // Simple JS sandbox via Worker — executes the code in isolation
    const blob = new Blob([`
      self.onmessage = function(e) {
        const code = e.data;
        let output = '';
        const origLog = console.log;
        // Intercept console.log
        const lines = [];
        const fakeConsole = { log: (...args) => lines.push(args.map(String).join(' ')) };
        try {
          // Use Function constructor to run code in a limited scope
          const fn = new Function('console', code);
          fn(fakeConsole);
          output = lines.join('\\n') || '(no output)';
        } catch(err) {
          output = 'Error: ' + err.message;
        }
        self.postMessage(output);
      };
    `], { type: 'application/javascript' });

    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    workerRef.current = worker;

    const timeout = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      setCodeOutputs((m) => new Map(m).set(key, 'Timed out after 5s'));
    }, 5000);

    worker.onmessage = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      URL.revokeObjectURL(url);
      setCodeOutputs((m) => new Map(m).set(key, e.data as string));
    };

    worker.postMessage(code);
  }, []);

  const handleExport = (fmt: 'md' | 'txt' | 'pdf') => {
    if (fmt === 'pdf') {
      window.print();
      return;
    }
    const mime = fmt === 'md' ? 'text/markdown' : 'text/plain';
    const ext  = fmt === 'md' ? 'md' : 'txt';
    const blob = new Blob([canvas.content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${canvas.title || 'document'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Custom code renderer: adds a "Run" button for JS/Python blocks
  const CodeBlock = useCallback(({ node: _node, className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { node?: unknown }) => {
    const isBlock = className?.startsWith('language-');
    if (!isBlock) {
      return <code className="bg-bg-elevated px-1 py-0.5 rounded text-[0.85em] font-mono text-text-hi" {...props}>{children}</code>;
    }
    const lang = (className ?? '').replace('language-', '');
    const code = String(children).replace(/\n$/, '');
    const key  = `${lang}:${code.slice(0, 40)}`;
    const canRun = lang === 'javascript' || lang === 'js' || lang === 'python' || lang === 'py';
    const output = codeOutputs.get(key);

    return (
      <div className="my-3 rounded-xl overflow-hidden border border-border-hair">
        <div className="flex items-center justify-between px-3 py-1.5 bg-bg-elevated border-b border-border-hair">
          <span className="text-[10px] font-mono text-text-lo uppercase">{lang || 'code'}</span>
          {canRun && (
            <button
              onClick={() => runPython(code, key)}
              className="flex items-center gap-1 text-[10px] text-red-core hover:text-red-core/80 transition-colors font-medium"
            >
              <span>▶</span> Run
            </button>
          )}
        </div>
        <pre className="px-3 py-2.5 bg-bg-void overflow-x-auto">
          <code className="text-xs font-mono text-text-hi">{code}</code>
        </pre>
        {output !== undefined && (
          <div className="px-3 py-2 border-t border-border-hair bg-bg-panel">
            <pre className="text-xs font-mono text-text-lo whitespace-pre-wrap">{output}</pre>
          </div>
        )}
      </div>
    );
  }, [codeOutputs, runPython]);

  const editorArea = (
    <textarea
      value={canvas.content}
      onChange={(e) => updateCanvas({ content: e.target.value })}
      placeholder="Start writing… Markdown is supported."
      className="flex-1 w-full resize-none bg-transparent text-sm text-text-hi placeholder-text-lo outline-none leading-relaxed p-4 font-mono"
      style={{ fontFamily: 'var(--mono, monospace)' }}
    />
  );

  const previewArea = (
    <div className="flex-1 overflow-y-auto p-4 prose prose-invert prose-sm max-w-none canvas-print">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ code: CodeBlock as React.ComponentType<React.ComponentPropsWithoutRef<'code'>> }}
      >
        {canvas.content || '*Nothing here yet. Switch to Edit to start writing.*'}
      </ReactMarkdown>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-bg-void">
      <CanvasToolbar
        viewMode={viewMode}
        onViewMode={setViewMode}
        onExport={handleExport}
        onClose={() => setShowCanvas(false)}
        title={canvas.title}
        onTitleChange={(t) => updateCanvas({ title: t })}
      />

      <div className="flex flex-1 min-h-0">
        {viewMode === 'edit' && (
          <div className="flex flex-col flex-1 min-h-0">{editorArea}</div>
        )}
        {viewMode === 'preview' && (
          <div className="flex flex-col flex-1 min-h-0">{previewArea}</div>
        )}
        {viewMode === 'split' && (
          <>
            <div className="flex flex-col flex-1 min-h-0 border-r border-border-hair">{editorArea}</div>
            <div className="flex flex-col flex-1 min-h-0">{previewArea}</div>
          </>
        )}
      </div>
    </div>
  );
}
