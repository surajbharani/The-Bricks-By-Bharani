import { useState, useRef, useEffect } from 'react';

export type CanvasViewMode = 'edit' | 'preview' | 'split';

interface Props {
  viewMode: CanvasViewMode;
  onViewMode: (m: CanvasViewMode) => void;
  onExport: (fmt: 'md' | 'txt' | 'pdf') => void;
  onClose: () => void;
  title: string;
  onTitleChange: (t: string) => void;
}

export function CanvasToolbar({ viewMode, onViewMode, onExport, onClose, title, onTitleChange }: Props) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const h = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [exportOpen]);

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-hair bg-bg-panel flex-shrink-0">
      {/* Title */}
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        className="flex-1 bg-transparent text-sm font-semibold text-text-hi outline-none placeholder-text-lo min-w-0"
        placeholder="Untitled"
      />

      {/* View mode tabs */}
      <div className="flex bg-bg-elevated border border-border-hair rounded-lg p-0.5 gap-0.5">
        {(['edit', 'split', 'preview'] as CanvasViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onViewMode(m)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
              viewMode === m
                ? 'bg-red-core text-white'
                : 'text-text-lo hover:text-text-hi'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Export */}
      <div className="relative" ref={exportRef}>
        <button
          onClick={() => setExportOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-elevated border border-border-hair rounded-lg text-xs text-text-lo hover:text-text-hi transition-colors"
        >
          <ExportIcon />
          Export
        </button>
        {exportOpen && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-bg-elevated border border-border-hair rounded-xl shadow-xl z-50 overflow-hidden">
            {(['md', 'txt', 'pdf'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => { onExport(fmt); setExportOpen(false); }}
                className="w-full px-3 py-2 text-left text-xs text-text-lo hover:text-text-hi hover:bg-bg-panel transition-colors flex items-center gap-2"
              >
                <span className="font-mono text-text-lo">.{fmt}</span>
                <span>{fmt === 'md' ? 'Markdown' : fmt === 'txt' ? 'Plain text' : 'PDF (print)'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Close canvas */}
      <button
        onClick={onClose}
        title="Close canvas"
        className="w-7 h-7 rounded-lg flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-bg-elevated transition-colors"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function ExportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
