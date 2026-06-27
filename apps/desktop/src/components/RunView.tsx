import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRun } from '../store/useRun';
import { useSession } from '../store/useSession';
import { useHistory } from '../store/useHistory';
import { TimelineNode } from './TimelineNode';
import { TokenStream } from './TokenStream';
import { SwarmLane } from './SwarmLane';
import { WorkspaceTree } from './WorkspaceTree';
import { SummaryChip } from './SummaryChip';

export function RunView() {
  const { status, query, plan, thinking, steps, subagents, tokenStream, files, summary, errorMsg, tokensUsed, inr } =
    useRun();
  const { agentMode, model } = useSession();
  const { saveAgentRun } = useHistory();
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [steps.length, tokenStream.length, Object.keys(subagents).length, files.length, status]);

  // Save completed/failed agent runs to persistent history
  useEffect(() => {
    if ((status === 'done' || status === 'error') && query && !savedRef.current) {
      savedRef.current = true;
      saveAgentRun({
        query,
        summary: summary || errorMsg || '',
        status,
        tokensUsed,
        model,
      });
    }
    if (status === 'idle' || status === 'planning' || status === 'running') {
      savedRef.current = false;
    }
  }, [status, query, summary, errorMsg, tokensUsed, model, saveAgentRun]);

  if (status === 'idle') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-bg-elevated border border-border-hair flex items-center justify-center">
          <AgentIcon />
        </div>
        <div>
          <p className="text-text-hi font-semibold">Agent Nano Bricks</p>
          <p className="text-sm text-text-lo mt-1">
            {agentMode === 'swarm'
              ? 'Describe your task — the Team will split and tackle it in parallel.'
              : 'Describe your task — the agent will plan and execute it step by step.'}
          </p>
        </div>
      </div>
    );
  }

  const isActive = status === 'planning' || status === 'running';

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-0">
      {/* Query bubble */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end mb-4"
      >
        <div className="max-w-[75%] px-4 py-2.5 rounded-xl bg-red-core/15 border border-red-core/25">
          <p className="text-sm text-text-hi">{query}</p>
        </div>
      </motion.div>

      {/* Agent response card */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-xl bg-bg-panel border border-border-hair"
      >
        {/* Plan */}
        <AnimatePresence>
          {plan.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-3"
            >
              <p className="text-xs text-text-lo font-mono uppercase tracking-wider mb-2">Plan</p>
              <ol className="space-y-1 list-none">
                {plan.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-[10px] font-mono text-text-lo mt-0.5 flex-shrink-0 w-4">
                      {idx + 1}.
                    </span>
                    <span className="text-xs text-text-hi leading-snug">{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-3 h-px bg-border-hair" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Thinking ticker */}
        <AnimatePresence>
          {thinking && isActive && (
            <motion.div
              key={thinking}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-3 flex items-center gap-2"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                className="w-3 h-3 border border-text-lo border-t-red-core rounded-full flex-shrink-0"
              />
              <p className="text-xs text-text-lo italic truncate">{thinking}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Timeline steps */}
        {steps.length > 0 && (
          <div className="space-y-0 mb-2">
            {steps.map((step, idx) => (
              <TimelineNode key={step.i} step={step} isLast={idx === steps.length - 1} />
            ))}
          </div>
        )}

        {/* Swarm lanes */}
        {agentMode === 'swarm' && (
          <SwarmLane subagents={subagents} />
        )}

        {/* Token stream */}
        <TokenStream text={tokenStream} streaming={isActive} />

        {/* File activity */}
        <WorkspaceTree files={files} />

        {/* Summary / error chips */}
        {status === 'done' && (
          <SummaryChip ok={true} summary={summary} tokensUsed={tokensUsed} inr={inr} />
        )}
        {status === 'error' && (
          <SummaryChip ok={false} summary={errorMsg} tokensUsed={tokensUsed} inr={inr} />
        )}
      </motion.div>
    </div>
  );
}

function AgentIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="4" y="8" width="20" height="14" rx="3" stroke="#FF1F2E" strokeWidth="1.5" />
      <path d="M9 8V6a5 5 0 0 1 10 0v2" stroke="#FF1F2E" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="15" r="1.5" fill="#FF1F2E" />
      <circle cx="18" cy="15" r="1.5" fill="#FF1F2E" />
      <path d="M11 19h6" stroke="#FF1F2E" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
