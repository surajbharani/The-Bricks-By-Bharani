import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const isMac = typeof navigator !== 'undefined' && (
  navigator.userAgent.includes('Mac') ||
  // @ts-expect-error — userAgentData is not in all TS lib versions yet
  navigator.userAgentData?.platform === 'macOS'
);
const mod = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS = [
  { keys: [mod, 'N'],        description: 'New conversation' },
  { keys: [mod, 'K'],        description: 'Show keyboard shortcuts' },
  { keys: [mod, ','],        description: 'Open settings' },
  { keys: [mod, 'L'],        description: 'Focus composer / clear input' },
  { keys: [mod, '⇧', 'C'],  description: 'Toggle canvas' },
  { keys: ['Enter'],         description: 'Send message' },
  { keys: ['⇧', 'Enter'],   description: 'New line in composer' },
  { keys: ['Esc'],           description: 'Close modal / cancel rename' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="shortcuts-backdrop"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-void/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            key="shortcuts-panel"
            className="relative w-full max-w-md bg-bg-panel border border-border-hair rounded-2xl shadow-2xl p-6"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-text-hi">Keyboard Shortcuts</h2>
              <button
                onClick={onClose}
                className="text-text-lo hover:text-text-hi transition-colors text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Shortcut rows */}
            <div className="flex flex-col gap-2">
              {SHORTCUTS.map(({ keys, description }) => (
                <div key={description} className="flex items-center justify-between py-1.5 border-b border-border-hair/50 last:border-0">
                  <span className="text-xs text-text-lo">{description}</span>
                  <div className="flex items-center gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded bg-bg-elevated border border-border-hair text-[10px] font-mono text-text-hi"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[10px] text-text-lo text-center">
              More shortcuts coming soon
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
