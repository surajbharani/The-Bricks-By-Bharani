import { motion } from 'framer-motion';

interface Props {
  ok: boolean;
  summary: string;
  tokensUsed: number;
  inr: number;
}

export function SummaryChip({ ok, summary, tokensUsed, inr }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="mt-4 p-4 rounded-xl border"
      style={{
        borderColor: ok ? '#28C76F44' : '#FF1F2E44',
        backgroundColor: ok ? '#28C76F08' : '#FF1F2E08',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: ok ? '#28C76F' : '#FF1F2E' }}
        />
        <span
          className="text-sm font-semibold"
          style={{ color: ok ? '#28C76F' : '#FF1F2E' }}
        >
          {ok ? 'Task Complete' : 'Task Failed'}
        </span>
        {tokensUsed > 0 && (
          <span className="ml-auto text-xs text-text-lo font-mono">
            {tokensUsed.toLocaleString()} tokens · ₹{inr.toFixed(3)}
          </span>
        )}
      </div>
      {summary && (
        <p className="text-sm text-text-hi leading-relaxed whitespace-pre-wrap">{summary}</p>
      )}
    </motion.div>
  );
}
