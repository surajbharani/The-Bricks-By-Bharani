import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface DailyUsage {
  promptTokens: number;
  completionTokens: number;
  estInr: number;
  dailyTokenCap: number;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  usage: DailyUsage | null;

  setSession: (session: Session | null) => void;
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUsage: () => Promise<void>;
}

export const useAuth = create<AuthState>()((set, get) => ({
  session: null,
  user: null,
  loading: true,
  usage: null,

  setSession: (session) =>
    set({ session, user: session?.user ?? null, loading: false }),

  signInWithEmail: async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: undefined, // desktop: no redirect needed
      },
    });
    return { error: error?.message ?? null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, usage: null });
  },

  refreshUsage: async () => {
    const { user } = get();
    if (!user) return;

    const today = new Date().toISOString().slice(0, 10);

    const [usageRes, subRes] = await Promise.all([
      supabase
        .from('usage_daily')
        .select('prompt_tokens, completion_tokens, est_inr')
        .eq('user_id', user.id)
        .eq('day', today)
        .maybeSingle(),
      supabase
        .from('subscriptions')
        .select('tier_id, tiers(daily_token_cap)')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const row = usageRes.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tierData = subRes.data as any;
    const dailyTokenCap =
      tierData?.tiers?.daily_token_cap ?? 50_000;

    set({
      usage: {
        promptTokens: row?.prompt_tokens ?? 0,
        completionTokens: row?.completion_tokens ?? 0,
        estInr: row?.est_inr ?? 0,
        dailyTokenCap,
      },
    });
  },
}));

// Bootstrap auth on import — listens to Supabase auth events
supabase.auth.getSession().then(({ data: { session } }) => {
  useAuth.getState().setSession(session);
  if (session) useAuth.getState().refreshUsage();
});

supabase.auth.onAuthStateChange((_event, session) => {
  useAuth.getState().setSession(session);
  if (session) useAuth.getState().refreshUsage();
});
