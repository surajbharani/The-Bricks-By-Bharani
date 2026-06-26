import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../store/useAuth';

type Tab = 'signin' | 'signup';
type Step = 'form' | 'otp' | 'done';

const DEV_USER = 'developer';
const DEV_PASS = 'Pagalpanti@123';

export function AuthGate() {
  const { signInWithPassword, signUp, verifyOtp, devSignIn } = useAuth();

  const [tab, setTab] = useState<Tab>('signin');
  const [step, setStep] = useState<Step>('form');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Dev bypass panel state
  const [showDev, setShowDev] = useState(false);
  const [devUser, setDevUser] = useState('');
  const [devPass, setDevPass] = useState('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pendingEmail = useRef('');

  const resetForm = () => {
    setError('');
    setPassword('');
    setConfirmPassword('');
    setOtp(['', '', '', '', '', '']);
    setStep('form');
  };

  const handleTabChange = (t: Tab) => {
    setTab(t);
    resetForm();
  };

  // ── Sign In ──────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError('');
    const { error: err } = await signInWithPassword(email.trim().toLowerCase(), password);
    setBusy(false);
    if (err) {
      setError(
        err.toLowerCase().includes('invalid') || err.toLowerCase().includes('credentials')
          ? 'Wrong email or password. Please try again.'
          : err
      );
    }
    // On success Supabase fires onAuthStateChange → App unmounts AuthGate automatically
  };

  // ── Sign Up ──────────────────────────────────────────────────────────────
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
    const { error: err, needsOtp } = await signUp(email.trim().toLowerCase(), password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (needsOtp) {
      pendingEmail.current = email.trim().toLowerCase();
      setStep('otp');
    }
    // if !needsOtp, auth state changed and we're in
  };

  // ── OTP verify ───────────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length < 6) return;
    setBusy(true);
    setError('');
    const { error: err } = await verifyOtp(pendingEmail.current, code);
    setBusy(false);
    if (err) {
      setError('Invalid or expired code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    }
    // on success Supabase fires auth state change
  };

  const handleOtpKey = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
    if (!val && i > 0) otpRefs.current[i - 1]?.focus();
  };

  // ── Dev bypass ───────────────────────────────────────────────────────────
  const handleDevLogin = () => {
    if (devUser === DEV_USER && devPass === DEV_PASS) {
      devSignIn();
    } else {
      setError('Wrong developer credentials.');
    }
  };

  const btnActive = !busy && (tab === 'signup'
    ? email.trim() && password && confirmPassword
    : email.trim() && password);

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

            {/* ── OTP step ── */}
            {step === 'otp' ? (
              <motion.div key="otp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h2 className="text-base font-semibold text-text-hi font-display mb-1">Check your email</h2>
                <p className="text-sm text-text-lo mb-5">
                  We sent a 6-digit code to{' '}
                  <span className="text-text-hi">{pendingEmail.current}</span>. Enter it below.
                </p>

                <div className="flex gap-2 justify-center mb-4">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpKey(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
                        if (e.key === 'Enter' && otp.join('').length === 6) handleVerifyOtp();
                      }}
                      autoFocus={i === 0}
                      className="w-11 h-12 text-center text-lg font-bold rounded-xl bg-bg-elevated border border-border-hair text-text-hi outline-none focus:border-red-core/60 focus:shadow-red-glow transition-all duration-150"
                    />
                  ))}
                </div>

                {error && <p className="text-xs text-red-core mb-3 text-center">{error}</p>}

                <RedButton
                  onClick={handleVerifyOtp}
                  disabled={!btnIsReady(otp.join(''), 6) || busy}
                  busy={busy}
                  label="Verify & sign in"
                />

                <button
                  onClick={() => { setStep('form'); setOtp(['', '', '', '', '', '']); setError(''); }}
                  className="w-full mt-3 text-xs text-text-lo hover:text-text-hi transition-colors text-center"
                >
                  ← Go back
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
                      onClick={() => handleTabChange(t)}
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
                  disabled={!btnActive}
                  busy={busy}
                  label={tab === 'signin' ? 'Sign in →' : 'Create account →'}
                />

                {tab === 'signup' && (
                  <p className="text-center text-xs text-text-lo mt-4 opacity-60">
                    New accounts get a free Casual plan automatically.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Developer Check — hidden at launch */}
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

function btnIsReady(val: string, len: number) {
  return val.length >= len;
}

function RedButton({
  onClick, disabled, busy, label,
}: {
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  label: string;
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
