import type { Env } from './types';

const OPENROUTER_IMAGE_URL = 'https://openrouter.ai/api/v1/images/generations';

export async function handleImage(request: Request, env: Env): Promise<Response> {
  let body: { prompt?: string; model?: string };
  try {
    body = await request.json();
  } catch {
    return jsonErr('Invalid request body', 400);
  }

  const { prompt, model } = body;
  if (!prompt || typeof prompt !== 'string') {
    return jsonErr('prompt is required', 400);
  }
  if (!model || typeof model !== 'string') {
    return jsonErr('model is required', 400);
  }

  const upstream = await fetch(OPENROUTER_IMAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://nanobricks.app',
      'X-Title': 'Nano Bricks',
    },
    body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024' }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => 'Unknown error');
    return jsonErr(`Image generation failed: ${errText}`, upstream.status);
  }

  const data = await upstream.json() as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };

  const first = data.data?.[0];
  if (!first) return jsonErr('No image returned', 502);

  const result = first.url
    ? { url: first.url }
    : { b64: first.b64_json };

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonErr(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
