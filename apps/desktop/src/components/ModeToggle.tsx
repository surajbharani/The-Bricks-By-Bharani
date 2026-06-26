import { motion } from 'framer-motion';
import { useSession, type AppMode } from '../store/useSession';

const MODES: { id: AppMode; label: string; subtitle: string }[] = [
  { id: 'chat', label: 'Chat', subtitle: 'Conversation' },
  { id: 'agent', label: 'Agent', subtitle: 'Autonomous tasks' },
];

export function ModeToggle() {
  const { mode, setMode } = useSession();

  return (
    <div className="flex items-center gap-1 bg-bg-panel border border-border-hair rounded-lg p-1 relative">
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => setMode(m.id)}
          className="relative px-4 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 z-10 group"
          style={{ color: mode === m.id ? '#F4F4F6' : '#8A8A93' }}
          title={m.subtitle}
        >
          {mode === m.id && (
            <motion.div
              layoutId="mode-pill"
              className="absolute inset-0 rounded-md toggle-active"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10 font-display">{m.label}</span>
        </button>
      ))}
    </div>
  );
}
