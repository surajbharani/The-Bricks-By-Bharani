import { motion } from 'framer-motion';
import type { RunStep } from '../store/useRun';

interface Props {
  step: RunStep;
  isLast: boolean;
  index: number;
}

const DOT_COLOR: Record<RunStep['status'], string> = {
  run: '#FF1F2E',
  ok: '#28C76F',
  fail: '#FF6B6B',
};

const STATUS_LABEL: Record<RunStep['status'], string> = {
  run: 'Running',
  ok: '✓ Done',
  fail: '✗ Failed',
};

function stepIcon(label: string, status: RunStep['status']): string {
  if (status === 'fail') return '✗';
  const l = label.toLowerCase();
  if (l.includes('search') || l.includes('research') || l.includes('find') || l.includes('look')) return '🔍';
  if (l.includes('write') || l.includes('creat') || l.includes('generat')) return '✍️';
  if (l.includes('read') || l.includes('open') || l.includes('load')) return '📖';
  if (l.includes('web') || l.includes('fetch') || l.includes('url') || l.includes('browser') || l.includes('download')) return '🌐';
  if (l.includes('file') || l.includes('save') || l.includes('stor')) return '💾';
  if (l.includes('run') || l.includes('exec') || l.includes('shell') || l.includes('install') || l.includes('pip')) return '⚙️';
  if (l.includes('verif') || l.includes('check') || l.includes('test') || l.includes('confirm')) return '✅';
  if (l.includes('plan') || l.includes('analys')) return '🗺️';
  if (l.includes('send') || l.includes('post') || l.includes('submit') || l.includes('upload')) return '📤';
  if (l.includes('done') || l.includes('complet') || l.includes('finish')) return '🎯';
  return '▸';
}

export function TimelineNode({ step, isLast, index }: Props) {
  const icon = stepIcon(step.label, step.status);
  const color = DOT_COLOR[step.status];

  return (
    <div className="flex gap-3">
      {/* Spine */}
      <div className="flex flex-col items-center flex-shrink-0">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: index * 0.04 }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-0.5 relative"
          style={{
            background: `${color}22`,
            border: `2px solid ${color}66`,
            boxShadow: step.status === 'run' ? `0 0 12px ${color}66` : 'none',
          }}
        >
          <span style={{ fontSize: icon.length > 1 ? '13px' : '10px' }}>{icon}</span>

        </motion.div>

        {!isLast && (
          <motion.div
            className="w-px flex-1 mt-1"
            style={{ background: `${color}33`, transformOrigin: 'top' }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
          />
        )}
      </div>

      {/* Content */}
      <motion.div
        className="pb-4 min-w-0 flex-1"
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.04 + 0.05 }}
      >
        <div className="w-full text-left">
          <div className="flex items-start gap-2">
            <span className="text-sm text-text-hi leading-tight flex-1">{step.label}</span>
            <span
              className="text-[9px] font-mono flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded-full"
              style={{
                color,
                background: `${color}18`,
                border: `1px solid ${color}33`,
              }}
            >
              {STATUS_LABEL[step.status]}
            </span>
          </div>
        </div>

        {/* Running pulse bar */}
        {step.status === 'run' && (
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="mt-1.5 h-0.5 w-20 rounded-full"
            style={{ background: `linear-gradient(90deg, ${color}, ${color}44)` }}
          />
        )}
      </motion.div>
    </div>
  );
}
