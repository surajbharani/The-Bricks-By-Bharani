import type { Env, ChatRequest } from './types';

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function isOpenRouterModel(model: string): boolean {
  return (
    model.startsWith('openrouter/') ||
    model.startsWith('openai/') ||
    model.startsWith('anthropic/') ||
    model.startsWith('google/') ||
    model.startsWith('meta-llama/')
  );
}

export async function fetchFromProvider(
  body: ChatRequest,
  env: Env
): Promise<Response> {
  const useOpenRouter = isOpenRouterModel(body.model);
  const url = useOpenRouter ? OPENROUTER_URL : DEEPSEEK_URL;
  const apiKey = useOpenRouter ? env.OPENROUTER_KEY : env.DEEPSEEK_KEY;

  // Normalize model ID for each upstream:
  // - openrouter/X/Y  → X/Y  (strip "openrouter/" prefix)
  // - deepseek/X      → X    (strip "deepseek/" prefix for DeepSeek API)
  let upstreamModel = body.model;
  if (useOpenRouter && body.model.startsWith('openrouter/')) {
    upstreamModel = body.model.slice('openrouter/'.length);
  } else if (!useOpenRouter && body.model.startsWith('deepseek/')) {
    upstreamModel = body.model.slice('deepseek/'.length);
  }
  const upstreamBody = { ...body, model: upstreamModel };

  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(useOpenRouter
        ? {
            'HTTP-Referer': 'https://nanobricks.app',
            'X-Title': 'Nano Bricks',
          }
        : {}),
    },
    body: JSON.stringify({ ...upstreamBody, stream: true }),
  });

  // If DeepSeek fails, fall back to OpenRouter using the normalized model name
  if (!upstream.ok && !useOpenRouter) {
    const fallback = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://nanobricks.app',
        'X-Title': 'Nano Bricks',
      },
      body: JSON.stringify({ ...upstreamBody, stream: true }),
    });
    return fallback;
  }

  return upstream;
}
