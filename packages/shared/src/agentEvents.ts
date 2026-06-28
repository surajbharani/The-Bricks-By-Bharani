export type AgentEvent =
  | { t: 'plan'; steps: string[] }
  | { t: 'thinking'; text: string }
  | { t: 'step'; i: number; label: string; status: 'run' | 'ok' | 'fail' }
  | { t: 'tool_call'; name: string; inputSummary: string }
  | { t: 'tool_result'; name: string; outputSummary: string; ok: boolean }
  | { t: 'file'; path: string; action: 'write' | 'edit' }
  | { t: 'token'; text: string }
  | { t: 'subagent'; id: string; brick: string; name?: string; status: 'spawned' | 'working' | 'done'; summary?: string }
  | { t: 'spend'; tokens: number; inr: number }
  | { t: 'done'; ok: boolean; summary: string; tokensUsed: number }
  | { t: 'error'; message: string };
