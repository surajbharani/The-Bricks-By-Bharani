import { motion } from 'framer-motion';
import { useSession } from '../store/useSession';
import { useRun } from '../store/useRun';

interface Props {
  onStop: () => void;
}

export function RunHeader({ onStop }: Props) {
  const { model, agentMode, agentAskEnabled, setAgentAskEnabled } = useSession();
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
        {/* Ask-me toggle — when off, the agent never pauses to ask questions */}
        <button
          onClick={() => setAgentAskEnabled(!agentAskEnabled)}
          title={
            agentAskEnabled
              ? 'Agent can ask you questions when it needs clarity. Click to turn off.'
              : 'Agent will never ask — it decides everything itself. Click to turn on.'
          }
          className="flex items-center gap-1.5 group"
        >
          <span className="text-[10px] font-mono uppercase tracking-wide text-text-lo group-hover:text-text-hi transition-colors">
            Ask&nbsp;me
          </span>
          <span
            className="relative w-7 h-4 rounded-full transition-colors duration-200"
            style={{ background: agentAskEnabled ? '#FF1F2E' : '#26262B' }}
          >
            <motion.span
              className="absolute top-0.5 w-3 h-3 rounded-full bg-white"
              animate={{ left: agentAskEnabled ? '14px' : '2px' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </span>
        </button>

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
