import { motion, AnimatePresence } from 'framer-motion';
import { useSession, type AgentMode } from '../store/useSession';

const MODES: {
  id: AgentMode;
  label: string;
  techLabel: string;
  tooltip: string;
}[] = [
  {
    id: 'solo',
    label: 'Single',
    techLabel: 'Solo',
    tooltip: 'One focused agent completes your task from start to finish.',
  },
  {
    id: 'swarm',
    label: 'Team',
    techLabel: 'Swarm',
    tooltip: 'Multiple agents work in parallel — faster on big tasks.',
  },
];

export function SwarmToggle() {
  const { mode, agentMode, setAgentMode } = useSession();

  return (
    <AnimatePresence>
      {mode === 'agent' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-1 bg-bg-panel border border-border-hair rounded-lg p-1"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setAgentMode(m.id)}
              title={m.tooltip}
              className="relative px-3 py-1 rounded-md text-xs font-medium transition-colors duration-150 z-10 flex flex-col items-center gap-0"
              style={{ color: agentMode === m.id ? '#F4F4F6' : '#8A8A93' }}
            >
              {agentMode === m.id && (
                <motion.div
                  layoutId="swarm-pill"
                  className="absolute inset-0 rounded-md toggle-active"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 font-display leading-tight">{m.label}</span>
              <span className="relative z-10 text-[9px] opacity-50 leading-none font-mono">
                {m.techLabel}
              </span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
