import { motion } from 'framer-motion';
import { useSession } from '../store/useSession';
import { useRun } from '../store/useRun';

interface Props {
  onStop: () => void;
}

export function RunHeader({ onStop }: Props) {
  const { model, agentMode } = useSession();
  const { status, tokensUsed, inr } = useRun();

  const isActive = status === 'planning' || status === 'running';
  const modelShort = model.split('/').pop() ?? model;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border-hair bg-bg-panel/60">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-text-lo">{modelShort}</span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wide"
          style={{
            borderColor: agentMode === 'swarm' ? '#FF1F2E55' : '#26262B',
            color: agentMode === 'swarm' ? '#FF1F2E' : '#8A8A93',
          }}
        >
          {agentMode === 'swarm' ? 'Team' : 'Solo'}
        </span>

        {isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-1"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-core animate-pulse" />
            <span className="text-xs text-text-lo">Running…</span>
          </motion.div>
        )}

        {status === 'done' && (
          <span className="text-xs text-ok">Done</span>
        )}
        {status === 'error' && (
          <span className="text-xs text-red-core">Error</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {tokensUsed > 0 && (
          <span className="text-xs text-text-lo font-mono">
            {tokensUsed.toLocaleString()} tokens · ₹{inr.toFixed(3)}
          </span>
        )}
        {isActive && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onStop}
            className="text-xs px-2 py-1 rounded border border-border-hair text-text-lo hover:border-red-core/50 hover:text-red-core transition-colors"
          >
            Stop
          </motion.button>
        )}
      </div>
    </div>
  );
}
