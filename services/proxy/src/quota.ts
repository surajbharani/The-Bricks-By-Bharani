import type { Env, TierCaps, DailyUsage, TokenUsage } from './types';

const DEFAULT_CAPS: TierCaps = {
  tierId: 'casual',
  dailyTokenCap: 50_000,
  monthlyInrCap: 50,
};

// ─── Supabase REST helpers ────────────────────────────────────────────────────

function supabaseHeaders(env: Env) {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    Prefer: 'return=representation',
  };
}

async function supabaseGet<T>(env: Env, path: string): Promise<T[]> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: supabaseHeaders(env),
  });
  if (!res.ok) return [];
  return res.json() as Promise<T[]>;
}

// ─── Load tier caps for user ──────────────────────────────────────────────────

async function loadTierCaps(userId: string, env: Env): Promise<TierCaps> {
  const [subs, tiers] = await Promise.all([
    supabaseGet<{ tier_id: string; status: string }>(
      env,
      `subscriptions?user_id=eq.${userId}&status=eq.active&select=tier_id,status`
    ),
    supabaseGet<{ id: string; daily_token_cap: number; monthly_inr_cap: number }>(
      env,
      `tiers?select=id,daily_token_cap,monthly_inr_cap`
    ),
  ]);

  const tierId = subs[0]?.tier_id ?? 'casual';
  const tier = tiers.find((t) => t.id === tierId);
  if (!tier) return DEFAULT_CAPS;

  return {
    tierId,
    dailyTokenCap: tier.daily_token_cap,
    monthlyInrCap: tier.monthly_inr_cap,
  };
}

// ─── Load today's usage ───────────────────────────────────────────────────────

async function loadDailyUsage(userId: string, env: Env): Promise<DailyUsage> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await supabaseGet<{
    prompt_tokens: number;
    completion_tokens: number;
    est_inr: number;
  }>(env, `usage_daily?user_id=eq.${userId}&day=eq.${today}&select=prompt_tokens,completion_tokens,est_inr`);

  const row = rows[0];
  return {
    promptTokens: row?.prompt_tokens ?? 0,
    completionTokens: row?.completion_tokens ?? 0,
    estInr: row?.est_inr ?? 0,
  };
}

// ─── Load this month's total ₹ spend ─────────────────────────────────────────

async function loadMonthlySpend(userId: string, env: Env): Promise<number> {
  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const rows = await supabaseGet<{ est_inr: number }>(
    env,
    `usage_daily?user_id=eq.${userId}&day=gte.${firstDay}&select=est_inr`
  );
  return rows.reduce((sum, r) => sum + (r.est_inr ?? 0), 0);
}

// ─── Public: check quota ──────────────────────────────────────────────────────

export interface QuotaResult {
  ok: boolean;
  reason?: string;
  caps: TierCaps;
  usage: DailyUsage;
}

export async function checkQuota(userId: string, env: Env): Promise<QuotaResult> {
  const [caps, usage, monthlySpend] = await Promise.all([
    loadTierCaps(userId, env),
    loadDailyUsage(userId, env),
    loadMonthlySpend(userId, env),
  ]);

  const totalDailyTokens = usage.promptTokens + usage.completionTokens;

  if (totalDailyTokens >= caps.dailyTokenCap) {
    return {
      ok: false,
      reason: `You've used all ${caps.dailyTokenCap.toLocaleString()} tokens available today. Your limit resets at midnight.`,
      caps,
      usage,
    };
  }

  if (monthlySpend >= caps.monthlyInrCap) {
    return {
      ok: false,
      reason: `You've reached your monthly spend limit of ₹${caps.monthlyInrCap}. This resets on the 1st of next month.`,
      caps,
      usage,
    };
  }

  return { ok: true, caps, usage };
}

// ─── Public: write usage row ──────────────────────────────────────────────────

export async function writeUsage(userId: string, tokenUsage: TokenUsage, env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Upsert: on conflict (user_id, day) increment the counters
  await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/upsert_usage_daily`, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify({
      p_user_id: userId,
      p_day: today,
      p_prompt_tokens: tokenUsage.promptTokens,
      p_completion_tokens: tokenUsage.completionTokens,
      p_est_inr: tokenUsage.estInr,
    }),
  }).catch(() => {
    // Fallback: plain upsert (overwrites — acceptable for Phase 2)
    return fetch(`${env.SUPABASE_URL}/rest/v1/usage_daily`, {
      method: 'POST',
      headers: { ...supabaseHeaders(env), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: userId,
        day: today,
        prompt_tokens: tokenUsage.promptTokens,
        completion_tokens: tokenUsage.completionTokens,
        est_inr: tokenUsage.estInr,
      }),
    });
  });
}

// ─── Spend alert (called from cron or post-request) ──────────────────────────

export async function checkAndAlertSpend(env: Env): Promise<void> {
  const threshold = 1000; // ₹ alert threshold

  const rows = await supabaseGet<{ user_id: string; est_inr: number }>(
    env,
    `usage_daily?day=eq.${new Date().toISOString().slice(0, 10)}&select=user_id,est_inr`
  );

  const totalToday = rows.reduce((s, r) => s + r.est_inr, 0);
  if (totalToday > threshold) {
    await fetch(`https://api.mailchannels.net/tx/v1/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: env.ALERT_EMAIL }] }],
        from: { email: `alerts@nanobricks.app`, name: 'Nano Bricks Alerts' },
        subject: `Spend Alert: ₹${totalToday.toFixed(2)} today`,
        content: [{ type: 'text/plain', value: `Daily spend is ₹${totalToday.toFixed(2)}, above threshold ₹${threshold}.` }],
      }),
    }).catch(() => {}); // don't fail the request if email fails
  }
}
