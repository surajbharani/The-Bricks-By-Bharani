import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTools, TOOL_REGISTRY } from '../store/useTools';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ToolMarketplace({ open, onClose }: Props) {
  const { enabled, toggleTool } = useTools();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="marketplace-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-bg-void/80 backdrop-blur-sm flex items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            key="marketplace-panel"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md mx-4 bg-bg-panel border border-border-hair rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-hair">
              <div>
                <h2 className="text-sm font-bold text-text-hi font-display">Tool Marketplace</h2>
                <p className="text-xs text-text-lo mt-0.5">Enable or disable tools for your workflow</p>
              </div>
              <button onClick={onClose} className="text-text-lo hover:text-text-hi transition-colors text-xs">
                ✕
              </button>
            </div>

            {/* Tool cards */}
            <div className="p-4 space-y-3">
              {TOOL_REGISTRY.map((tool) => {
                const isOn = enabled[tool.id] ?? false;
                return (
                  <div
                    key={tool.id}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl bg-bg-elevated border border-border-hair"
                  >
                    <span className="text-2xl flex-shrink-0">{tool.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-hi">{tool.name}</p>
                      <p className="text-xs text-text-lo mt-0.5 leading-relaxed">{tool.description}</p>
                    </div>
                    <button
                      onClick={() => toggleTool(tool.id)}
                      className={`relative w-10 h-5 rounded-full flex-shrink-0 transition-colors duration-200 ${
                        isOn ? 'bg-red-core' : 'bg-border-hair'
                      }`}
                      aria-label={isOn ? `Disable ${tool.name}` : `Enable ${tool.name}`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                          isOn ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3 border-t border-border-hair">
              <p className="text-xs text-text-lo text-center">
                Enabled tools appear in the chat toolbar below
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
