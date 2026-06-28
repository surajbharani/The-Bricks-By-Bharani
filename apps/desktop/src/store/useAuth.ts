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
    // Local dev bypass — no Supabase call, sets a synthetic session state.
    // Persist a flag so the dev session survives reloads (e.g. the crash-recovery
    // reload), otherwise the in-memory session is lost and the user is bounced to login.
    try { localStorage.setItem('nano-bricks-dev', '1'); } catch { /* ignore */ }
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
    try { localStorage.removeItem('nano-bricks-dev'); } catch { /* ignore */ }
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
// 1. Restore a persisted dev session first (survives reloads).
const hadDevSession = (() => {
  try { return localStorage.getItem('nano-bricks-dev') === '1'; } catch { return false; }
})();

if (hadDevSession) {
  useAuth.getState().devSignIn();
} else {
  supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      // A dev session may have been set in the meantime — never overwrite it.
      if (useAuth.getState().isDev) return;
      useAuth.getState().setSession(session);
      if (session) useAuth.getState().refreshUsage();
    })
    .catch(() => {
      if (!useAuth.getState().isDev) useAuth.getState().setSession(null);
    });
}

// 2. React to auth changes — but DEFENSIVELY.
// Supabase fires events liberally (token refresh races, focus re-checks, initial
// session) and some carry a null session that must NOT log the user out. Only an
// explicit SIGNED_OUT clears the session. Dev sessions ignore Supabase entirely.
supabase.auth.onAuthStateChange((event, session) => {
  const state = useAuth.getState();

  // Dev session is managed manually — Supabase events never touch it.
  if (state.isDev) return;

  switch (event) {
    case 'SIGNED_OUT':
      useAuth.getState().setSession(null);
      break;
    case 'INITIAL_SESSION':
    case 'SIGNED_IN':
    case 'TOKEN_REFRESHED':
    case 'USER_UPDATED':
      // Only adopt a *real* session. A spurious null here is ignored so the
      // user is never bounced to the login screen mid-use.
      if (session) {
        useAuth.getState().setSession(session);
        // Defer the DB read out of the auth callback — calling Supabase inside
        // onAuthStateChange can deadlock the SDK.
        setTimeout(() => useAuth.getState().refreshUsage(), 0);
      }
      break;
    default:
      break;
  }
});
