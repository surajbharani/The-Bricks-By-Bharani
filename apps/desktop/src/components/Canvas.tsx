import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSession } from '../store/useSession';
import { CanvasToolbar, type CanvasViewMode } from './CanvasToolbar';
import { CodeBlock as SharedCodeBlock } from './CodeBlock';

export function Canvas() {
  const { canvas, updateCanvas, setShowCanvas } = useSession();
  const [viewMode, setViewMode] = useState<CanvasViewMode>('edit');

  const handleExport = (fmt: 'md' | 'txt' | 'pdf') => {
    if (fmt === 'pdf') {
      // Switch to preview so there's rendered HTML to print
      if (viewMode === 'edit') setViewMode('preview');
      // Inject a print style that hides everything except the canvas preview area
      const style = document.createElement('style');
      style.id = 'canvas-print-style';
      style.textContent = `
        @media print {
          body * { visibility: hidden !important; }
          .canvas-print, .canvas-print * { visibility: visible !important; }
          .canvas-print {
            position: fixed !important;
            inset: 0 !important;
            overflow: visible !important;
            background: white !important;
            color: black !important;
            padding: 2cm !important;
          }
        }
      `;
      document.head.appendChild(style);
      window.print();
      // Remove after print dialog closes
      setTimeout(() => style.remove(), 500);
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

  // Custom code renderer using shared CodeBlock component
  const CanvasCodeBlock = useCallback(({ node: _node, className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { node?: unknown }) => {
    const isBlock = className?.startsWith('language-');
    if (!isBlock) {
      return <code className="bg-bg-elevated px-1 py-0.5 rounded text-[0.85em] font-mono text-text-hi" {...props}>{children}</code>;
    }
    const lang = (className ?? '').replace('language-', '');
    const code = String(children).replace(/\n$/, '');
    return <SharedCodeBlock language={lang} code={code} runnable />;
  }, []);

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
        components={{ code: CanvasCodeBlock as React.ComponentType<React.ComponentPropsWithoutRef<'code'>> }}
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
