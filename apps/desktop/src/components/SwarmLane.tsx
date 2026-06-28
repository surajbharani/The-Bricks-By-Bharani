import { motion } from 'framer-motion';
import type { SubagentRun } from '../store/useRun';

interface Props {
  subagents: Record<string, SubagentRun>;
}

const STATUS_COLOR = {
  spawned: '#4A4A5A',
  working: '#FF1F2E',
  done: '#00FF88',
} as const;

export function SwarmLane({ subagents }: Props) {
  const list = Object.values(subagents);
  if (list.length === 0) return null;

  const doneCount = list.filter((a) => a.status === 'done').length;
  const workingCount = list.filter((a) => a.status === 'working').length;

  return (
    <div className="mt-4 mb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1 h-3 rounded-full"
                style={{ background: '#FF1F2E' }}
                animate={{ scaleY: workingCount > 0 ? [0.4, 1, 0.4] : 0.4 }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
              />
            ))}
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-text-lo">
            SWARM EXECUTION
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          {workingCount > 0 && (
            <span style={{ color: '#FF1F2E' }}>{workingCount} ACTIVE</span>
          )}
          <span style={{ color: '#00FF88' }}>{doneCount}/{list.length} DONE</span>
        </div>
      </div>

      {/* Agent grid — all appear at once */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(list.length, 2)}, 1fr)` }}
      >
        {list.map((agent, idx) => {
          const color = STATUS_COLOR[agent.status];
          const isWorking = agent.status === 'working';
          const isDone = agent.status === 'done';

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.04, type: 'spring', stiffness: 300, damping: 26 }}
              className="relative overflow-hidden rounded-lg border"
              style={{
                borderColor: color + '55',
                background: '#0A0A0F',
                boxShadow: isWorking ? `0 0 16px ${color}33` : isDone ? `0 0 8px ${color}22` : 'none',
              }}
            >
              {/* Scanning line for working agents */}
              {isWorking && (
                <motion.div
                  className="absolute inset-x-0 h-px pointer-events-none"
                  style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                />
              )}

              {/* Done flash */}
              {isDone && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: color + '08' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                />
              )}

              <div className="p-3">
                {/* Top row: ID + status badge */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[11px] font-mono font-bold tracking-wider"
                    style={{ color }}
                  >
                    {agent.name || `AGENT-${agent.id}`}
                  </span>
                  <div
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase"
                    style={{ background: color + '18', color, border: `1px solid ${color}44` }}
                  >
                    {isWorking && (
                      <motion.div
                        className="w-1 h-1 rounded-full"
                        style={{ background: color }}
                        animate={{ opacity: [1, 0.2, 1] }}
                        transition={{ duration: 0.6, repeat: Infinity }}
                      />
                    )}
                    {isDone ? 'DONE' : isWorking ? 'EXEC' : 'INIT'}
                  </div>
                </div>

                {/* Goal text */}
                <p className="text-[11px] text-text-hi leading-snug line-clamp-2 mb-2">
                  {agent.brick}
                </p>

                {/* Summary when done */}
                {agent.summary && (
                  <p className="text-[10px] text-text-lo leading-snug line-clamp-1 mb-2">
                    {agent.summary}
                  </p>
                )}

                {/* Progress bar */}
                <div className="h-[2px] rounded-full overflow-hidden" style={{ background: '#1A1A24' }}>
                  {agent.status === 'spawned' && (
                    <div className="h-full w-[8%] rounded-full" style={{ background: color }} />
                  )}
                  {isWorking && (
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }}
                      animate={{ width: ['15%', '80%', '15%'] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                  {isDone && (
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: color }}
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 0.4 }}
                    />
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
