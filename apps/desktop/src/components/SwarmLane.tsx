import { motion, AnimatePresence } from 'framer-motion';
import type { SubagentRun } from '../store/useRun';

interface Props {
  subagents: Record<string, SubagentRun>;
}

const STATUS_COLOR = {
  spawned: '#8A8A93',
  working: '#FF1F2E',
  done: '#28C76F',
} as const;

const STATUS_LABEL = {
  spawned: 'Queued',
  working: 'Working…',
  done: 'Done',
} as const;

function getInitials(name?: string): string {
  if (!name) return '?';
  return name.slice(0, 2).toUpperCase();
}

export function SwarmLane({ subagents }: Props) {
  const list = Object.values(subagents);
  if (list.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      <p className="text-[10px] font-mono uppercase tracking-widest text-text-lo flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-core animate-pulse inline-block" />
        Team Bricks — {list.length} agent{list.length !== 1 ? 's' : ''}
      </p>

      {/* SVG connector line between cards */}
      <div className="relative">
        {list.length > 1 && (
          <div
            className="absolute left-8 top-10 bottom-10 w-px"
            style={{ background: 'linear-gradient(to bottom, #FF1F2E22, #FF1F2E44, #FF1F2E22)' }}
          />
        )}

        <AnimatePresence>
          {list.map((agent, idx) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08, type: 'spring', stiffness: 260, damping: 24 }}
              className="relative mb-3"
            >
              {/* Traveling dot on connector */}
              {idx < list.length - 1 && agent.status === 'done' && (
                <motion.div
                  className="absolute left-[30px] w-2 h-2 rounded-full z-10"
                  style={{ background: STATUS_COLOR.done }}
                  initial={{ top: 'calc(100% + 4px)' }}
                  animate={{ top: ['calc(100% + 4px)', 'calc(100% + 36px)', 'calc(100% + 4px)'] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}

              <div
                className="relative overflow-hidden rounded-xl border transition-all duration-300"
                style={{
                  borderColor: STATUS_COLOR[agent.status] + '44',
                  background: `linear-gradient(135deg, var(--bg-elevated) 0%, ${STATUS_COLOR[agent.status]}08 100%)`,
                  boxShadow: agent.status === 'working'
                    ? `0 0 20px ${STATUS_COLOR.working}22`
                    : agent.status === 'done'
                      ? `0 0 12px ${STATUS_COLOR.done}18`
                      : 'none',
                }}
              >
                {/* Working shimmer animation */}
                {agent.status === 'working' && (
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, #FF1F2E18 50%, transparent 100%)',
                    }}
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}

                <div className="flex items-start gap-4 p-4">
                  {/* Avatar circle */}
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-base select-none"
                      style={{
                        background: `linear-gradient(135deg, ${STATUS_COLOR[agent.status]}33, ${STATUS_COLOR[agent.status]}66)`,
                        border: `2px solid ${STATUS_COLOR[agent.status]}88`,
                        color: STATUS_COLOR[agent.status],
                        fontSize: '15px',
                      }}
                    >
                      {getInitials(agent.name)}
                    </div>

                    {/* Pulse ring for spawned */}
                    {agent.status === 'spawned' && (
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{ border: `2px solid ${STATUS_COLOR.spawned}` }}
                        animate={{ scale: [1, 1.4], opacity: [0.8, 0] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                      />
                    )}

                    {/* Spin ring for working */}
                    {agent.status === 'working' && (
                      <motion.div
                        className="absolute -inset-1 rounded-full"
                        style={{
                          border: '2px solid transparent',
                          borderTopColor: STATUS_COLOR.working,
                          borderRightColor: STATUS_COLOR.working + '55',
                        }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                      />
                    )}

                    {/* Done checkmark overlay */}
                    {agent.status === 'done' && (
                      <motion.div
                        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: STATUS_COLOR.done }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </motion.div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {agent.name && (
                        <span className="text-sm font-bold" style={{ color: STATUS_COLOR[agent.status] }}>
                          {agent.name}
                        </span>
                      )}
                      <span
                        className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                        style={{
                          background: STATUS_COLOR[agent.status] + '22',
                          color: STATUS_COLOR[agent.status],
                          border: `1px solid ${STATUS_COLOR[agent.status]}44`,
                        }}
                      >
                        {STATUS_LABEL[agent.status]}
                      </span>
                      <span className="text-[9px] text-text-lo font-mono ml-auto">#{agent.id}</span>
                    </div>

                    <p className="text-xs text-text-hi leading-snug line-clamp-2 mb-1">{agent.brick}</p>

                    {agent.summary && (
                      <p className="text-[11px] text-text-lo leading-snug line-clamp-2 italic">
                        {agent.summary}
                      </p>
                    )}

                    {/* Status bar at bottom */}
                    <div className="mt-2 h-1 rounded-full overflow-hidden bg-bg-void/50">
                      {agent.status === 'spawned' && (
                        <div className="h-full w-[15%] rounded-full" style={{ background: STATUS_COLOR.spawned }} />
                      )}
                      {agent.status === 'working' && (
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: `linear-gradient(90deg, #FF1F2E, #8E0E16)` }}
                          animate={{ width: ['20%', '85%', '20%'] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
                      {agent.status === 'done' && (
                        <motion.div
                          className="h-full w-full rounded-full"
                          style={{ background: STATUS_COLOR.done }}
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{ duration: 0.5 }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
