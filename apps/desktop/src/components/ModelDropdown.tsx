import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODELS } from '@nano-bricks/shared';
import { useSession } from '../store/useSession';

export function ModelDropdown() {
  const { model, setModel } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS.find((m) => m.id === model) ?? MODELS[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 bg-bg-panel border border-border-hair rounded-lg text-sm text-text-hi hover:border-red-core/40 transition-colors duration-150"
      >
        <span className="font-display">{current.label}</span>
        <ChevronIcon open={open} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-1 w-64 bg-bg-panel border border-border-hair rounded-lg overflow-hidden shadow-xl z-50"
          >
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => { setModel(m.id); setOpen(false); }}
                className="w-full text-left px-4 py-3 hover:bg-bg-elevated transition-colors duration-100 flex items-start gap-3"
              >
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: m.id === model ? '#FF1F2E' : '#26262B' }}
                />
                <div>
                  <div className="text-sm font-medium text-text-hi font-display">{m.label}</div>
                  <div className="text-xs text-text-lo mt-0.5">{m.description}</div>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s',
        color: '#8A8A93',
      }}
    >
      <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
