import { motion } from 'framer-motion';
import type { SubagentRun } from '../store/useRun';

interface Props {
  subagents: Record<string, SubagentRun>;
}

const STATUS_COLOR: Record<SubagentRun['status'], string> = {
  spawned: '#8A8A93',
  working: '#FF1F2E',
  done: '#28C76F',
};

const STATUS_LABEL: Record<SubagentRun['status'], string> = {
  spawned: 'Queued',
  working: 'Working',
  done: 'Done',
};

export function SwarmLane({ subagents }: Props) {
  const list = Object.values(subagents);
  if (list.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-xs text-text-lo font-mono uppercase tracking-wider mb-2">
        Team Bricks ({list.length})
      </p>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {list.map((agent) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            className="p-2.5 rounded-lg border bg-bg-void/40"
            style={{ borderColor: STATUS_COLOR[agent.status] + '44' }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <motion.div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: STATUS_COLOR[agent.status] }}
                animate={
                  agent.status === 'working'
                    ? { opacity: [1, 0.3, 1] }
                    : { opacity: 1 }
                }
                transition={{ duration: 1, repeat: agent.status === 'working' ? Infinity : 0 }}
              />
              <span
                className="text-[10px] font-mono uppercase"
                style={{ color: STATUS_COLOR[agent.status] }}
              >
                {STATUS_LABEL[agent.status]}
              </span>
              <span className="text-[10px] text-text-lo font-mono ml-auto">#{agent.id}</span>
            </div>
            <p className="text-xs text-text-hi leading-snug line-clamp-2">{agent.brick}</p>
            {agent.summary && (
              <p className="text-[11px] text-text-lo mt-1 leading-snug line-clamp-2 italic">
                {agent.summary}
              </p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
