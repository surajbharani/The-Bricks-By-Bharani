import { useEffect } from 'react';
import { useAuth } from '../store/useAuth';

export function UsageMeter() {
  const { usage, refreshUsage, user } = useAuth();

  // Refresh after each message stream ends
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(refreshUsage, 30_000);
    return () => clearInterval(interval);
  }, [user, refreshUsage]);

  if (!usage || !user) return null;

  const totalTokens = usage.promptTokens + usage.completionTokens;
  const pct = Math.min(100, (totalTokens / usage.dailyTokenCap) * 100);
  const remaining = Math.max(0, usage.dailyTokenCap - totalTokens);

  const barColor =
    pct >= 90 ? '#FF1F2E' : pct >= 70 ? '#F59E0B' : '#28C76F';

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-bg-panel border border-border-hair rounded-lg">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-lo font-mono">Today</span>
          <span className="text-[10px] text-text-hi font-mono">
            {remaining.toLocaleString()} tokens left
          </span>
        </div>

        {/* Bar */}
        <div className="w-24 h-1 bg-bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
      </div>

      {usage.estInr > 0 && (
        <span className="text-[10px] text-text-lo font-mono border-l border-border-hair pl-3">
          ₹{usage.estInr.toFixed(3)}
        </span>
      )}
    </div>
  );
}
