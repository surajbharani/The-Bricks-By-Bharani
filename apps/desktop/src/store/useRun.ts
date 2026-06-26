import { create } from 'zustand';
import type { AgentEvent } from '@nano-bricks/shared';

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
  status: 'spawned' | 'working' | 'done';
  summary?: string;
}

export interface FileActivity {
  path: string;
  action: 'write' | 'edit';
}

export type RunStatus = 'idle' | 'planning' | 'running' | 'done' | 'error';

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

  startRun: (query: string) => void;
  applyEvent: (event: AgentEvent) => void;
  resetRun: () => void;
}

const INITIAL: Omit<RunState, 'startRun' | 'applyEvent' | 'resetRun'> = {
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
};

export const useRun = create<RunState>((set) => ({
  ...INITIAL,

  startRun: (query) =>
    set({ ...INITIAL, status: 'planning', query, tokenStream: '' }),

  resetRun: () => set({ ...INITIAL }),

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
            status: event.status,
            summary: event.summary,
          };
          return { subagents: updated };
        }

        case 'spend':
          return { tokensUsed: event.tokens, inr: event.inr };

        case 'done':
          return {
            status: 'done',
            summary: event.summary,
            tokensUsed: event.tokensUsed,
          };

        case 'error':
          return { status: 'error', errorMsg: event.message };

        default:
          return {};
      }
    }),
}));
