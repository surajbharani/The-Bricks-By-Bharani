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
  isDev: boolean;

  setSession: (session: Session | null) => void;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsOtp: boolean }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>;
  /** Legacy magic-link — kept for back-compat */
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  devSignIn: () => void;
  signOut: () => Promise<void>;
  refreshUsage: () => Promise<void>;
}

export const useAuth = create<AuthState>()((set, get) => ({
  session: null,
  user: null,
  loading: true,
  usage: null,
  isDev: false,

  setSession: (session) =>
    set({ session, user: session?.user ?? null, loading: false }),

  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: undefined, // use OTP, not link
      },
    });
    if (error) return { error: error.message, needsOtp: false };
    // If user already exists and is confirmed, Supabase still returns no error
    // but identities array is empty — treat as "needs to sign in instead"
    const needsOtp = !data.session; // no session means OTP verification is pending
    return { error: null, needsOtp };
  },

  signInWithPassword: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  },

  verifyOtp: async (email, token) => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    });
    return { error: error?.message ?? null };
  },

  signInWithEmail: async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    return { error: error?.message ?? null };
  },

  devSignIn: () => {
    // Local dev bypass — no Supabase call, sets a synthetic session state
    set({
      isDev: true,
      loading: false,
      user: {
        id: 'dev-user',
        email: 'developer@nanobricks.internal',
        app_metadata: {},
        user_metadata: { name: 'Developer' },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as unknown as User,
      session: {
        access_token: 'dev-token',
        refresh_token: 'dev-refresh',
        expires_in: 2592000,
        token_type: 'bearer',
        user: {
          id: 'dev-user',
          email: 'developer@nanobricks.internal',
          app_metadata: {},
          user_metadata: { name: 'Developer' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as User,
      } as unknown as Session,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        estInr: 0,
        dailyTokenCap: 999_999,
      },
    });
  },

  signOut: async () => {
    const { isDev } = get();
    if (!isDev) await supabase.auth.signOut();
    set({ session: null, user: null, usage: null, isDev: false });
  },

  refreshUsage: async () => {
    const { user, isDev } = get();
    if (!user || isDev) return;

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
    const dailyTokenCap = tierData?.tiers?.daily_token_cap ?? 50_000;

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

// Bootstrap auth on import
supabase.auth.getSession().then(({ data: { session } }) => {
  useAuth.getState().setSession(session);
  if (session) useAuth.getState().refreshUsage();
});

supabase.auth.onAuthStateChange((_event, session) => {
  useAuth.getState().setSession(session);
  if (session) useAuth.getState().refreshUsage();
});
