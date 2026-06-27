export interface Env {
  // Secrets — set via `wrangler secret put`
  DEEPSEEK_KEY: string;
  OPENROUTER_KEY: string;
  SUPABASE_JWT_SECRET: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // Plain vars — in wrangler.toml [vars]
  SUPABASE_URL: string;
  ALERT_EMAIL: string;
  APP_ORIGIN: string;

  // KV binding
  RATE_LIMIT_KV: KVNamespace;
}

export interface AuthUser {
  sub: string;
  email: string;
}

export interface TierCaps {
  tierId: string;
  dailyTokenCap: number;
  monthlyInrCap: number;
}

export interface DailyUsage {
  promptTokens: number;
  completionTokens: number;
  estInr: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  estInr: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

// INR per 1K tokens (update when pricing changes)
export const PRICING = {
  'deepseek/deepseek-chat':           { inputPer1K: 0.023, outputPer1K: 0.092 },
  'deepseek/deepseek-reasoner':      { inputPer1K: 0.115, outputPer1K: 0.46  },
  default:                            { inputPer1K: 0.084, outputPer1K: 0.336 },
} as const;

export function estimateInr(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICING[model as keyof typeof PRICING] ?? PRICING.default;
  return (promptTokens / 1000) * p.inputPer1K + (completionTokens / 1000) * p.outputPer1K;
}
