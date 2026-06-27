import { useState, useRef, useEffect } from 'react';
import { useSession } from '../store/useSession';
import { MODELS } from '@nano-bricks/shared';

export function ThinkingToggle() {
  const { model, thinking, setThinking } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isReasoningModel = MODELS.find((m) => m.id === model)?.reasoning ?? false;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!isReasoningModel) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          if (thinking.enabled) {
            setThinking({ enabled: false });
          } else {
            setOpen((v) => !v);
          }
        }}
        title={thinking.enabled ? 'Thinking mode on — click to disable' : 'Enable thinking mode'}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          thinking.enabled
            ? 'bg-red-core/15 border-red-core/40 text-red-core'
            : 'bg-bg-panel border-border-hair text-text-lo hover:text-text-hi hover:border-red-core/30'
        }`}
      >
        <BrainIcon active={thinking.enabled} />
        <span>{thinking.enabled ? (thinking.budget === 'fast' ? 'Think · Fast' : 'Think · Deep') : 'Think'}</span>
      </button>

      {open && !thinking.enabled && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-bg-elevated border border-border-hair rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 text-[10px] text-text-lo uppercase tracking-wider border-b border-border-hair">
            Thinking budget
          </div>
          {(['fast', 'thorough'] as const).map((b) => (
            <button
              key={b}
              onClick={() => { setThinking({ enabled: true, budget: b }); setOpen(false); }}
              className="w-full flex flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-bg-panel transition-colors"
            >
              <span className="text-xs font-medium text-text-hi capitalize">{b === 'fast' ? 'Fast' : 'Thorough'}</span>
              <span className="text-[10px] text-text-lo">
                {b === 'fast' ? '≈4k reasoning tokens' : '≈16k reasoning tokens'}
              </span>
            </button>
          ))}
          <div className="border-t border-border-hair">
            <button
              onClick={() => { setThinking({ enabled: false, showSteps: thinking.showSteps }); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-xs text-text-lo hover:text-text-hi hover:bg-bg-panel transition-colors"
            >
              Off
            </button>
          </div>
        </div>
      )}

      {thinking.enabled && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-bg-elevated border border-border-hair rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 text-[10px] text-text-lo uppercase tracking-wider border-b border-border-hair">
            Thinking budget
          </div>
          {(['fast', 'thorough'] as const).map((b) => (
            <button
              key={b}
              onClick={() => { setThinking({ budget: b }); setOpen(false); }}
              className={`w-full flex flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-bg-panel transition-colors ${
                thinking.budget === b ? 'bg-bg-panel' : ''
              }`}
            >
              <span className={`text-xs font-medium capitalize flex items-center gap-1.5 ${thinking.budget === b ? 'text-red-core' : 'text-text-hi'}`}>
                {thinking.budget === b && <span className="w-1 h-1 rounded-full bg-red-core" />}
                {b === 'fast' ? 'Fast' : 'Thorough'}
              </span>
              <span className="text-[10px] text-text-lo">
                {b === 'fast' ? '≈4k reasoning tokens' : '≈16k reasoning tokens'}
              </span>
            </button>
          ))}
          <div className="border-t border-border-hair px-3 py-2 flex items-center justify-between">
            <span className="text-[10px] text-text-lo">Show reasoning</span>
            <button
              onClick={() => setThinking({ showSteps: !thinking.showSteps })}
              className={`w-7 h-4 rounded-full transition-colors ${thinking.showSteps ? 'bg-red-core' : 'bg-border-hair'}`}
            >
              <span className={`block w-3 h-3 rounded-full bg-white shadow transition-transform m-0.5 ${thinking.showSteps ? 'translate-x-3' : ''}`} />
            </button>
          </div>
          <div className="border-t border-border-hair">
            <button
              onClick={() => { setThinking({ enabled: false }); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-xs text-text-lo hover:text-text-hi hover:bg-bg-panel transition-colors"
            >
              Turn off thinking
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BrainIcon({ active }: { active: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={active ? '#FF1F2E' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.77-3.33 2.5 2.5 0 0 1-1.01-3.09 2.5 2.5 0 0 1 1.48-3.07A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.77-3.33 2.5 2.5 0 0 0 1.01-3.09 2.5 2.5 0 0 0-1.48-3.07A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}
