import { useState } from 'react';

export function CoTSection({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1.5 border border-border-hair rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-bg-panel hover:bg-bg-elevated transition-colors text-left"
      >
        <ThinkIcon />
        <span className="text-xs text-text-lo flex-1">Thinking</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="px-3 py-2.5 bg-bg-void border-t border-border-hair max-h-60 overflow-y-auto">
          <pre className="text-[11px] text-text-lo font-mono whitespace-pre-wrap break-words leading-relaxed">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

function ThinkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FF1F2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.77-3.33 2.5 2.5 0 0 1-1.01-3.09 2.5 2.5 0 0 1 1.48-3.07A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.77-3.33 2.5 2.5 0 0 0 1.01-3.09 2.5 2.5 0 0 0-1.48-3.07A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="11" height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={`text-text-lo transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
