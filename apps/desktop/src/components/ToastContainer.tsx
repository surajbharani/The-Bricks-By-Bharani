import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useToast, type Toast } from '../store/useToast';

export function ToastContainer() {
  const { toasts } = useToast();
  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToast();

  useEffect(() => {
    // duration === 0 means "never auto-dismiss"; undefined defaults to 4000 ms
    if (toast.duration === 0) return;
    const ms = toast.duration ?? 4000;
    const timer = setTimeout(() => removeToast(toast.id), ms);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, removeToast]);

  const borderColor =
    toast.type === 'success' ? 'border-l-[#28C76F]' :
    toast.type === 'error'   ? 'border-l-red-core' :
                               'border-l-blue-400';

  const icon =
    toast.type === 'success' ? '✓' :
    toast.type === 'error'   ? '✕' : '●';

  const iconColor =
    toast.type === 'success' ? 'text-[#28C76F]' :
    toast.type === 'error'   ? 'text-red-core' : 'text-blue-400';

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`pointer-events-auto flex items-center gap-3 min-w-[220px] max-w-xs px-4 py-3 rounded-xl border-l-4 border border-border-hair bg-bg-panel shadow-lg ${borderColor}`}
    >
      <span className={`text-sm font-bold shrink-0 ${iconColor}`}>{icon}</span>
      <p className="flex-1 text-xs text-text-hi leading-snug">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="shrink-0 text-text-lo hover:text-text-hi transition-colors text-xs leading-none"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </motion.div>
  );
}
