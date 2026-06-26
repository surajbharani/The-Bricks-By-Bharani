import { supabase } from './supabase';

const PROXY_URL = import.meta.env.VITE_PROXY_URL || 'https://api.nanobricks.app';
const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_KEY as string | undefined;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ChatRequest {
  model: string;
  messages: { role: string; content: string }[];
}

async function getJwt(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Strip leading "openrouter/" prefix that OpenRouter itself doesn't expect
function normalizeModel(model: string): string {
  return model.startsWith('openrouter/') ? model.slice('openrouter/'.length) : model;
}

export async function* streamChat(req: ChatRequest): AsyncGenerator<string> {
  if (import.meta.env.DEV && !import.meta.env.VITE_USE_REAL_PROXY) {
    yield* stubStream(req.messages.at(-1)?.content ?? '');
    return;
  }

  // Direct OpenRouter path — used when VITE_OPENROUTER_KEY is embedded at build time
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
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Proxy error ${res.status}`);
  }

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
      } catch {
        // skip malformed chunks
      }
    }
  }
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
      } catch { /* skip malformed */ }
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

  for (const char of reply) {
    yield char;
    await delay(18);
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
