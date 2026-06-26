const MAX_REQUESTS_PER_MINUTE = 20;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
}

export async function checkRateLimit(userId: string, kv: KVNamespace): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / 60_000); // 1-minute fixed window
  const key = `rl:${userId}:${window}`;

  const current = parseInt((await kv.get(key)) ?? '0', 10);

  if (current >= MAX_REQUESTS_PER_MINUTE) {
    return { ok: false, remaining: 0 };
  }

  // Increment (fire-and-forget, TTL = 2 min)
  await kv.put(key, String(current + 1), { expirationTtl: 120 });

  return { ok: true, remaining: MAX_REQUESTS_PER_MINUTE - current - 1 };
}
