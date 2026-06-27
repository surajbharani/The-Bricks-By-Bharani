import { supabase } from './supabase';
import { useAuth } from '../store/useAuth';

const PROXY_URL = import.meta.env.VITE_PROXY_URL || 'https://api.nanobricks.app';
const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_KEY as string | undefined;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatRequest {
  model: string;
  messages: { role: string; content: string | ContentBlock[] }[];
}

async function getJwt(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function normalizeModel(model: string): string {
  return model.startsWith('openrouter/') ? model.slice('openrouter/'.length) : model;
}

function extractText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  const block = content.find((b) => b.type === 'text');
  return block?.type === 'text' ? block.text : '';
}

export async function* streamChat(req: ChatRequest): AsyncGenerator<string> {
  if (import.meta.env.DEV && !import.meta.env.VITE_USE_REAL_PROXY) {
    yield* stubStream(extractText(req.messages.at(-1)?.content ?? ''));
    return;
  }

  const isDev = useAuth.getState().isDev;

  if (isDev) {
    if (OPENROUTER_KEY) {
      yield* streamOpenRouter(req);
    } else {
      yield* devStub();
    }
    return;
  }

  if (OPENROUTER_KEY && req.model.startsWith('openrouter/')) {
    yield* streamOpenRouter(req);
    return;
  }

  const token = await getJwt();
  if (!token) throw new Error('You need to sign in before sending messages.');

  const res = await fetch(`${PROXY_URL}/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ model: req.model, messages: req.messages, stream: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Proxy error ${res.status}`);
  }

  yield* readSSEStream(res);
}

async function* streamOpenRouter(req: ChatRequest): AsyncGenerator<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://nanobricks.app',
      'X-Title': 'Nano Bricks',
    },
    body: JSON.stringify({
      model: normalizeModel(req.model),
      messages: req.messages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error?.message ?? `OpenRouter error ${res.status}`);
  }

  yield* readSSEStream(res);
}

async function* readSSEStream(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const chunk = JSON.parse(data);
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch { /* skip malformed chunks */ }
    }
  }
}

async function* stubStream(prompt: string): AsyncGenerator<string> {
  const reply =
    `You asked: "${prompt}"\n\n` +
    `I'm **Nano Bricks**, your AI agent. ` +
    `Switch to **Agent mode** to watch me plan, execute, and verify tasks step by step — ` +
    `or use **Team mode** to run parallel sub-agents for faster results.\n\n` +
    `*(This is a preview stub — connect the proxy to get real AI responses.)*`;
  for (const char of reply) { yield char; await delay(18); }
}

async function* devStub(): AsyncGenerator<string> {
  const reply =
    `**Developer mode** — OpenRouter key not embedded in this build.\n\n` +
    `To test real AI responses:\n` +
    `1. Add \`OPENROUTER_KEY\` secret in GitHub → Settings → Secrets → Actions\n` +
    `2. Re-trigger the Windows build from GitHub Actions\n` +
    `3. Install the new build\n\n` +
    `Everything else in the app works normally.`;
  for (const char of reply) { yield char; await delay(12); }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
