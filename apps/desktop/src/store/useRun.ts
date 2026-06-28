import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentEvent } from '@nano-bricks/shared';
import { deviceStorage } from '../lib/storage';

export interface RunStep {
  i: number;
  label: string;
  status: 'run' | 'ok' | 'fail';
}

export interface RunToolCall {
  name: string;
  inputSummary: string;
  outputSummary?: string;
  ok?: boolean;
}

export interface SubagentRun {
  id: string;
  brick: string;
  name?: string;
  status: 'spawned' | 'working' | 'done';
  summary?: string;
}

export interface FileActivity {
  path: string;
  action: 'write' | 'edit';
}

export interface PendingAsk {
  id: string;
  question: string;
  kind: 'question' | 'approval';
  options?: string[];
}

export type RunStatus = 'idle' | 'planning' | 'running' | 'done' | 'error';

export interface AgentHistoryItem {
  query: string;
  response: string;
  agentCount?: number;
  agentNames?: string[];
  tokensUsed?: number;
  mode?: 'solo' | 'swarm';
}

interface RunState {
  status: RunStatus;
  query: string;
  plan: string[];
  thinking: string;
  steps: RunStep[];
  toolCalls: RunToolCall[];
  subagents: Record<string, SubagentRun>;
  tokenStream: string;
  files: FileActivity[];
  tokensUsed: number;
  inr: number;
  summary: string;
  errorMsg: string;
  pendingAsk: PendingAsk | null;
  lastCheckpoint: string | null;

  // Persistent within the session — survives individual run resets
  agentHistory: AgentHistoryItem[];

  startRun: (query: string) => void;
  applyEvent: (event: AgentEvent) => void;
  resetRun: () => void;
  clearAsk: () => void;
  appendAgentHistory: (query: string, response: string) => void;
  clearAgentHistory: () => void;
}

const INITIAL: Omit<RunState, 'startRun' | 'applyEvent' | 'resetRun' | 'clearAsk' | 'appendAgentHistory' | 'clearAgentHistory' | 'agentHistory'> = {
  status: 'idle',
  query: '',
  plan: [],
  thinking: '',
  steps: [],
  toolCalls: [],
  subagents: {},
  tokenStream: '',
  files: [],
  tokensUsed: 0,
  inr: 0,
  summary: '',
  errorMsg: '',
  pendingAsk: null,
  lastCheckpoint: null,
};

export const useRun = create<RunState>()(
  persist(
    (set) => ({
  ...INITIAL,
  agentHistory: [],

  startRun: (query) =>
    set((s) => ({ ...INITIAL, agentHistory: s.agentHistory, status: 'planning', query, tokenStream: '' })),

  resetRun: () => set((s) => ({ ...INITIAL, agentHistory: s.agentHistory })),

  clearAsk: () => set({ pendingAsk: null }),

  appendAgentHistory: (query, response) =>
    set((s) => ({ agentHistory: [...s.agentHistory, { query, response }] })),

  clearAgentHistory: () => set({ ...INITIAL, agentHistory: [] }),

  applyEvent: (event) =>
    set((s) => {
      switch (event.t) {
        case 'plan':
          return { plan: event.steps, status: 'running' };

        case 'thinking':
          return { thinking: event.text, status: 'running' };

        case 'step': {
          const existing = s.steps.findIndex((st) => st.i === event.i);
          if (existing >= 0) {
            const updated = [...s.steps];
            updated[existing] = { i: event.i, label: event.label, status: event.status };
            return { steps: updated };
          }
          return { steps: [...s.steps, { i: event.i, label: event.label, status: event.status }] };
        }

        case 'tool_call':
          return {
            toolCalls: [
              ...s.toolCalls,
              { name: event.name, inputSummary: event.inputSummary },
            ],
          };

        case 'tool_result': {
          const calls = [...s.toolCalls];
          const last = calls.length - 1;
          if (last >= 0 && calls[last].name === event.name && calls[last].outputSummary === undefined) {
            calls[last] = { ...calls[last], outputSummary: event.outputSummary, ok: event.ok };
          }
          return { toolCalls: calls };
        }

        case 'file':
          return {
            files: [...s.files, { path: event.path, action: event.action }],
          };

        case 'token':
          return { tokenStream: s.tokenStream + event.text };

        case 'subagent': {
          const updated = { ...s.subagents };
          updated[event.id] = {
            id: event.id,
            brick: event.brick,
            name: event.name,
            status: event.status,
            summary: event.summary,
          };
          return { subagents: updated };
        }

        case 'spend':
          return { tokensUsed: event.tokens, inr: event.inr };

        case 'ask':
          return {
            pendingAsk: {
              id: event.id,
              question: event.question,
              kind: event.kind ?? 'question',
              options: event.options,
            },
          };

        case 'checkpoint':
          return { lastCheckpoint: event.id };

        case 'done': {
          const agents = Object.values(s.subagents);
          const agentNames = [...new Set(agents.map((a) => a.name).filter(Boolean))] as string[];
          const agentCount = agents.length;
          const mode: 'solo' | 'swarm' = agentCount <= 1 ? 'solo' : 'swarm';
          return {
            status: 'done',
            summary: event.summary,
            tokensUsed: event.tokensUsed,
            pendingAsk: null,
            agentHistory: [
              ...s.agentHistory,
              {
                query: s.query,
                response: event.summary || s.tokenStream,
                agentCount,
                agentNames,
                tokensUsed: event.tokensUsed,
                mode,
              },
            ],
          };
        }

        case 'error':
          return {
            status: 'error',
            errorMsg: event.message,
            pendingAsk: null,
            agentHistory: [
              ...s.agentHistory,
              { query: s.query, response: `⚠️ ${event.message}` },
            ],
          };

        default:
          return {};
      }
    }),
    }),
    {
      name: 'nano-bricks-run',
      storage: deviceStorage,
      // Only persist the conversation thread — transient run state stays in memory
      partialize: (s) => ({ agentHistory: s.agentHistory }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error('[useRun] Failed to rehydrate, clearing store:', error);
          localStorage.removeItem('nano-bricks-run');
        }
      },
    }
  )
);
