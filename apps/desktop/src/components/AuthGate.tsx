import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../store/useAuth';

type Tab = 'signin' | 'signup';
type Step = 'form' | 'confirm_sent';

const DEV_USER = 'developer';
const DEV_PASS = 'Pagalpanti@123';

export function AuthGate() {
  const { signInWithPassword, signUp, devSignIn } = useAuth();

  const [tab, setTab] = useState<Tab>('signin');
  const [step, setStep] = useState<Step>('form');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Dev bypass panel
  const [showDev, setShowDev] = useState(false);
  const [devUser, setDevUser] = useState('');
  const [devPass, setDevPass] = useState('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sentEmail = useRef('');

  const resetForm = () => {
    setError('');
    setPassword('');
    setConfirmPassword('');
    setStep('form');
  };

  // ── Sign In ───────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError('');
    const { error: err } = await signInWithPassword(email.trim().toLowerCase(), password);
    setBusy(false);
    if (err) {
      setError('Wrong email or password. Please try again.');
    }
    // On success Supabase auth state change → App unmounts AuthGate
  };

  // ── Sign Up ───────────────────────────────────────────────────────────────
  const handleSignUp = async () => {
    if (!email.trim() || !password) return;
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: err } = await signUp(email.trim().toLowerCase(), password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    // Supabase sends a confirmation link to the email.
    // Tauri catches nano-bricks://auth/callback and fires auth-deep-link → session set.
    sentEmail.current = email.trim().toLowerCase();
    setStep('confirm_sent');
  };

  // ── Dev bypass ────────────────────────────────────────────────────────────
  const handleDevLogin = () => {
    if (devUser === DEV_USER && devPass === DEV_PASS) {
      devSignIn();
    } else {
      setError('Wrong developer credentials.');
    }
  };

  const signInReady = !busy && email.trim() && password;
  const signUpReady = !busy && email.trim() && password && confirmPassword;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg-void dot-grid">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-sm mx-4 flex flex-col gap-4"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-4">
          <NanoBricksLogo />
          <div className="text-center">
            <h1 className="text-xl font-bold text-text-hi font-display tracking-wide">Nano Bricks</h1>
            <p className="text-sm text-text-lo mt-1">Your personal AI agent, by Bharani</p>
          </div>
        </div>

        {/* Main card */}
        <div className="bg-bg-panel border border-border-hair rounded-2xl p-6">
          <AnimatePresence mode="wait">

            {/* ── Confirmation sent step ── */}
            {step === 'confirm_sent' ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-4"
              >
                <div className="w-12 h-12 rounded-full bg-ok/10 border border-ok/30 flex items-center justify-center mx-auto mb-4">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M2 10l5 5L18 4" stroke="#28C76F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="text-base font-semibold text-text-hi font-display mb-2">Check your inbox</h2>
                <p className="text-sm text-text-lo leading-relaxed mb-1">
                  We sent a confirmation link to
                </p>
                <p className="text-sm text-text-hi font-medium mb-4">{sentEmail.current}</p>
                <p className="text-xs text-text-lo leading-relaxed opacity-80">
                  Click the link in that email to confirm your account. The app will open automatically and sign you in.
                </p>
                <button
                  onClick={() => { resetForm(); setTab('signup'); }}
                  className="mt-5 text-xs text-text-lo hover:text-text-hi transition-colors"
                >
                  ← Use a different email
                </button>
              </motion.div>

            ) : (
              /* ── Form step ── */
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                {/* Tabs */}
                <div className="flex bg-bg-elevated rounded-xl p-1 mb-5">
                  {(['signin', 'signup'] as Tab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTab(t); resetForm(); }}
                      className="flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-150 font-display"
                      style={{
                        background: tab === t ? 'linear-gradient(135deg, #FF1F2E, #8E0E16)' : 'transparent',
                        color: tab === t ? '#fff' : 'var(--text-lo)',
                        boxShadow: tab === t ? '0 0 12px #FF1F2E22' : 'none',
                      }}
                    >
                      {t === 'signin' ? 'Sign in' : 'Sign up'}
                    </button>
                  ))}
                </div>

                {/* Email */}
                <label className="block text-xs text-text-lo mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (tab === 'signin' ? handleSignIn() : handleSignUp())}
                  placeholder="you@example.com"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-bg-elevated border border-border-hair text-sm text-text-hi placeholder-text-lo outline-none focus:border-red-core/50 focus:shadow-red-glow transition-all duration-200 mb-3"
                />

                {/* Password */}
                <label className="block text-xs text-text-lo mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && tab === 'signin' && handleSignIn()}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl bg-bg-elevated border border-border-hair text-sm text-text-hi placeholder-text-lo outline-none focus:border-red-core/50 focus:shadow-red-glow transition-all duration-200 mb-3"
                />

                {/* Confirm password (sign-up only) */}
                <AnimatePresence>
                  {tab === 'signup' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <label className="block text-xs text-text-lo mb-1.5">Confirm password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSignUp()}
                        placeholder="••••••••"
                        className="w-full px-4 py-3 rounded-xl bg-bg-elevated border border-border-hair text-sm text-text-hi placeholder-text-lo outline-none focus:border-red-core/50 focus:shadow-red-glow transition-all duration-200 mb-3"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && <p className="text-xs text-red-core mb-3">{error}</p>}

                <RedButton
                  onClick={tab === 'signin' ? handleSignIn : handleSignUp}
                  disabled={!(tab === 'signin' ? signInReady : signUpReady)}
                  busy={busy}
                  label={tab === 'signin' ? 'Sign in →' : 'Create account →'}
                />

                {tab === 'signup' && (
                  <p className="text-center text-xs text-text-lo mt-4 opacity-60">
                    New accounts get a free Casual plan. Confirmation email will be sent.
                  </p>
                )}
                {tab === 'signin' && (
                  <p className="text-center text-xs text-text-lo mt-4 opacity-60">
                    Don't have an account? Switch to Sign up above.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Developer Check — removed at official launch */}
        <div className="bg-bg-panel border border-border-hair rounded-2xl overflow-hidden">
          <button
            onClick={() => { setShowDev((v) => !v); setError(''); }}
            className="w-full px-4 py-3 text-xs text-text-lo hover:text-text-hi flex items-center justify-between transition-colors"
          >
            <span>🛠 Developer Check</span>
            <span className="opacity-40">{showDev ? '▲' : '▼'}</span>
          </button>

          <AnimatePresence>
            {showDev && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden px-4 pb-4"
              >
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={devUser}
                    onChange={(e) => setDevUser(e.target.value)}
                    placeholder="Username"
                    className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border-hair text-sm text-text-hi placeholder-text-lo outline-none focus:border-red-core/40 transition-all"
                  />
                  <input
                    type="password"
                    value={devPass}
                    onChange={(e) => setDevPass(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
                    placeholder="Password"
                    className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border-hair text-sm text-text-hi placeholder-text-lo outline-none focus:border-red-core/40 transition-all"
                  />
                  {error && showDev && <p className="text-xs text-red-core">{error}</p>}
                  <button
                    onClick={handleDevLogin}
                    disabled={!devUser || !devPass}
                    className="w-full py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{
                      background: devUser && devPass ? '#8E0E16' : '#26262B',
                      cursor: devUser && devPass ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Enter as Developer
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function RedButton({ onClick, disabled, busy, label }: {
  onClick: () => void; disabled: boolean; busy: boolean; label: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors duration-150 font-display"
      style={{
        background: !disabled ? 'linear-gradient(135deg, #FF1F2E, #8E0E16)' : '#26262B',
        cursor: !disabled ? 'pointer' : 'not-allowed',
        boxShadow: !disabled ? '0 0 16px #FF1F2E33' : 'none',
      }}
    >
      {busy ? 'Please wait…' : label}
    </motion.button>
  );
}

function NanoBricksLogo() {
  return (
    <div
      className="w-16 h-16 rounded-2xl border border-red-core/30 flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #1A0305, #0A0A0B)', boxShadow: '0 0 24px #FF1F2E22' }}
    >
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <rect x="3" y="3" width="13" height="13" rx="3" fill="#FF1F2E" />
        <rect x="20" y="3" width="13" height="13" rx="3" fill="#FF1F2E" opacity="0.6" />
        <rect x="3" y="20" width="13" height="13" rx="3" fill="#FF1F2E" opacity="0.6" />
        <rect x="20" y="20" width="13" height="13" rx="3" fill="#FF1F2E" opacity="0.3" />
      </svg>
    </div>
  );
}
