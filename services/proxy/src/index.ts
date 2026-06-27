import type { Env } from './types';
import { extractBearerToken, verifySupabaseJWT } from './auth';
import { checkQuota } from './quota';
import { checkRateLimit } from './ratelimit';
import { handleChat } from './stream';
import { handleImage } from './image';
import { handleSearch } from './search';
import { checkAndAlertSpend } from './quota';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function cors(res: Response): Response {
  const next = new Response(res.body, res);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => next.headers.set(k, v));
  return next;
}

function json(body: unknown, status = 200): Response {
  return cors(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

export default {
  // ─── HTTP handler ───────────────────────────────────────────────────────────
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ── Health check ──────────────────────────────────────────────────────────
    if (url.pathname === '/health') {
      return json({ ok: true, service: 'nano-bricks-proxy', ts: Date.now() });
    }

    // ── Chat endpoint ─────────────────────────────────────────────────────────
    if (url.pathname === '/v1/chat' && request.method === 'POST') {
      // 1. Auth — extract & verify Supabase JWT
      const token = extractBearerToken(request);
      if (!token) {
        return json({ error: 'You need to sign in to use Nano Bricks.' }, 401);
      }

      const user = await verifySupabaseJWT(token, env.SUPABASE_JWT_SECRET);
      if (!user) {
        return json({ error: 'Your session has expired. Please sign in again.' }, 401);
      }

      // 2. Rate limit — per-user, 20 req/min
      const rateLimit = await checkRateLimit(user.sub, env.RATE_LIMIT_KV);
      if (!rateLimit.ok) {
        return json(
          { error: 'Too many requests. Please wait a moment before trying again.' },
          429
        );
      }

      // 3. Quota — daily tokens + monthly ₹ cap
      const quota = await checkQuota(user.sub, env);
      if (!quota.ok) {
        return json({ error: quota.reason }, 429);
      }

      // 4. Stream chat through provider
      const chatResponse = await handleChat(request, env, ctx, user.sub);
      return cors(chatResponse);
    }

    // ── Image generation endpoint ──────────────────────────────────────────────
    if (url.pathname === '/v1/image' && request.method === 'POST') {
      const token = extractBearerToken(request);
      if (!token) return json({ error: 'You need to sign in to use Nano Bricks.' }, 401);
      const user = await verifySupabaseJWT(token, env.SUPABASE_JWT_SECRET);
      if (!user) return json({ error: 'Your session has expired. Please sign in again.' }, 401);
      const rateLimit = await checkRateLimit(user.sub, env.RATE_LIMIT_KV);
      if (!rateLimit.ok) return json({ error: 'Too many requests. Please wait a moment before trying again.' }, 429);
      const imageResponse = await handleImage(request, env);
      return cors(imageResponse);
    }

    // ── Web search proxy endpoint ─────────────────────────────────────────────
    if (url.pathname === '/v1/search' && request.method === 'POST') {
      const searchResponse = await handleSearch(request);
      return cors(searchResponse);
    }

    return json({ error: 'Not found.' }, 404);
  },

  // ─── Cron trigger — daily spend alert ──────────────────────────────────────
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await checkAndAlertSpend(env);
  },
} satisfies ExportedHandler<Env>;
