import { useState, useRef, useEffect } from 'react';
import { useSession } from '../store/useSession';
import { MODELS } from '@nano-bricks/shared';

export function ThinkingToggle() {
  const { model, thinking, setThinking } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isReasoningModel = MODELS.find((m) => m.id === model)?.reasoning ?? false;

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Hide entirely for non-reasoning models; also reset if model switches away
  useEffect(() => {
    if (!isReasoningModel && thinking.enabled) {
      setThinking({ enabled: false });
      setOpen(false);
    }
  }, [isReasoningModel, thinking.enabled, setThinking]);

  if (!isReasoningModel) return null;

  return (
    <div className="relative" ref={ref}>
      {/* Main toggle button — always just opens/closes the dropdown */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={thinking.enabled ? 'Thinking mode on — click to change settings' : 'Enable thinking mode'}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          thinking.enabled
            ? 'bg-red-core/15 border-red-core/40 text-red-core'
            : 'bg-bg-panel border-border-hair text-text-lo hover:text-text-hi hover:border-red-core/30'
        }`}
      >
        <BrainIcon active={thinking.enabled} />
        <span>
          {thinking.enabled
            ? thinking.budget === 'fast' ? 'Think · Fast' : 'Think · Deep'
            : 'Think'}
        </span>
      </button>

      {/* Dropdown — gated on open for BOTH enabled and disabled states */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-bg-elevated border border-border-hair rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 text-[10px] text-text-lo uppercase tracking-wider border-b border-border-hair">
            Thinking budget
          </div>

          {(['fast', 'thorough'] as const).map((b) => (
            <button
              key={b}
              onClick={() => { setThinking({ enabled: true, budget: b }); setOpen(false); }}
              className={`w-full flex flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-bg-panel transition-colors ${
                thinking.enabled && thinking.budget === b ? 'bg-bg-panel' : ''
              }`}
            >
              <span className={`text-xs font-medium capitalize flex items-center gap-1.5 ${
                thinking.enabled && thinking.budget === b ? 'text-red-core' : 'text-text-hi'
              }`}>
                {thinking.enabled && thinking.budget === b && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-core flex-shrink-0" />
                )}
                {b === 'fast' ? 'Fast' : 'Thorough'}
              </span>
              <span className="text-[10px] text-text-lo">
                {b === 'fast' ? '≈4k reasoning tokens' : '≈16k reasoning tokens'}
              </span>
            </button>
          ))}

          {/* Show reasoning toggle — only makes sense when enabled */}
          {thinking.enabled && (
            <div className="border-t border-border-hair px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] text-text-lo">Show reasoning</span>
              <button
                onClick={(e) => { e.stopPropagation(); setThinking({ showSteps: !thinking.showSteps }); }}
                className={`w-7 h-4 rounded-full transition-colors relative ${thinking.showSteps ? 'bg-red-core' : 'bg-border-hair'}`}
                title={thinking.showSteps ? 'Hide reasoning steps' : 'Show reasoning steps'}
              >
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${thinking.showSteps ? 'translate-x-3' : ''}`} />
              </button>
            </div>
          )}

          <div className="border-t border-border-hair">
            {thinking.enabled ? (
              <button
                onClick={() => { setThinking({ enabled: false }); setOpen(false); }}
                className="w-full px-3 py-2 text-left text-xs text-text-lo hover:text-text-hi hover:bg-bg-panel transition-colors"
              >
                Turn off thinking
              </button>
            ) : (
              <button
                onClick={() => setOpen(false)}
                className="w-full px-3 py-2 text-left text-xs text-text-lo hover:text-text-hi hover:bg-bg-panel transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BrainIcon({ active }: { active: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke={active ? '#FF1F2E' : 'currentColor'} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.77-3.33 2.5 2.5 0 0 1-1.01-3.09 2.5 2.5 0 0 1 1.48-3.07A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.77-3.33 2.5 2.5 0 0 0 1.01-3.09 2.5 2.5 0 0 0-1.48-3.07A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}
