import type { Env, ChatRequest, TokenUsage } from './types';
import { estimateInr } from './types';
import { fetchFromProvider } from './providers';
import { writeUsage } from './quota';

interface MeterResult {
  stream: ReadableStream;
  usagePromise: Promise<void>;
}

/**
 * Pipes the upstream SSE stream to the client, capturing token usage
 * from the final chunk and writing a usage row when the stream ends.
 */
function createMeteringStream(
  upstreamBody: ReadableStream,
  model: string,
  userId: string,
  env: Env,
  ctx: ExecutionContext
): MeterResult {
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, estInr: 0 };

  let resolveUsage!: () => void;
  const usagePromise = new Promise<void>((resolve) => {
    resolveUsage = resolve;
  });

  const decoder = new TextDecoder();
  let buffer = '';

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Pass through raw bytes immediately (unbuffered)
      controller.enqueue(chunk);

      // Parse SSE lines to harvest usage from final chunk
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data) as {
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          if (parsed.usage) {
            usage.promptTokens = parsed.usage.prompt_tokens ?? usage.promptTokens;
            usage.completionTokens = parsed.usage.completion_tokens ?? usage.completionTokens;
          }
        } catch {
          // skip non-JSON lines
        }
      }
    },
    flush() {
      usage.estInr = estimateInr(model, usage.promptTokens, usage.completionTokens);
      ctx.waitUntil(
        writeUsage(userId, usage, env).finally(resolveUsage)
      );
    },
  });

  upstreamBody.pipeTo(writable).catch(() => resolveUsage());

  return { stream: readable, usagePromise };
}

export async function handleChat(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  userId: string
): Promise<Response> {
  let body: ChatRequest;
  try {
    body = await request.json() as ChatRequest;
  } catch {
    return jsonError(400, 'Request body must be valid JSON with a messages array.');
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError(400, 'Please include at least one message.');
  }

  const upstream = await fetchFromProvider(body, env);

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => 'Unknown upstream error');
    return jsonError(upstream.status, `AI service error: ${errText}`);
  }

  if (!upstream.body) {
    return jsonError(502, 'AI service returned an empty response.');
  }

  const { stream } = createMeteringStream(upstream.body, body.model, userId, env, ctx);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
