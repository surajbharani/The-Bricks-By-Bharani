import { motion } from 'framer-motion';
import type { RunStep } from '../store/useRun';

interface Props {
  step: RunStep;
  isLast: boolean;
}

const DOT_COLOR: Record<RunStep['status'], string> = {
  run: '#FF1F2E',
  ok: '#28C76F',
  fail: '#FF1F2E',
};

const DOT_LABEL: Record<RunStep['status'], string> = {
  run: 'Running',
  ok: '✓',
  fail: '✗',
};

export function TimelineNode({ step, isLast }: Props) {
  return (
    <div className="flex gap-3">
      {/* Spine */}
      <div className="flex flex-col items-center flex-shrink-0">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
          style={{
            backgroundColor: DOT_COLOR[step.status],
            boxShadow: step.status === 'run' ? `0 0 8px ${DOT_COLOR['run']}88` : 'none',
          }}
        />
        {!isLast && <div className="w-px flex-1 mt-1 bg-border-hair" />}
      </div>

      {/* Content */}
      <div className="pb-3 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-hi leading-tight">{step.label}</span>
          <span
            className="text-[10px] font-mono flex-shrink-0"
            style={{ color: DOT_COLOR[step.status] }}
          >
            {DOT_LABEL[step.status]}
          </span>
        </div>
        {step.status === 'run' && (
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="mt-1 h-0.5 w-16 rounded-full bg-red-core/50"
          />
        )}
      </div>
    </div>
  );
}
