import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../store/useAuth';

type Step = 'email' | 'sent';

export function AuthGate() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>('email');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: err } = await signInWithEmail(trimmed);
    setBusy(false);
    if (err) {
      setError('Could not send the link. Please try again.');
    } else {
      setStep('sent');
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg-void dot-grid">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-sm mx-4"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <NanoBricksLogo />
          <div className="text-center">
            <h1 className="text-xl font-bold text-text-hi font-display tracking-wide">Nano Bricks</h1>
            <p className="text-sm text-text-lo mt-1">Your personal AI agent, by Bharani</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-bg-panel border border-border-hair rounded-2xl p-6">
          <AnimatePresence mode="wait">
            {step === 'email' ? (
              <motion.div
                key="email"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <h2 className="text-base font-semibold text-text-hi font-display mb-1">Sign in</h2>
                <p className="text-sm text-text-lo mb-5">
                  We'll send a magic link to your email — no password needed.
                </p>

                <label className="block text-xs text-text-lo mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  placeholder="you@example.com"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-bg-elevated border border-border-hair text-sm text-text-hi placeholder-text-lo outline-none focus:border-red-core/50 focus:shadow-red-glow transition-all duration-200 mb-4"
                  style={{ fontFamily: 'var(--display)' }}
                />

                {error && (
                  <p className="text-xs text-red-core mb-3">{error}</p>
                )}

                <motion.button
                  onClick={send}
                  disabled={busy || !email.trim()}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors duration-150 font-display"
                  style={{
                    background: email.trim() && !busy
                      ? 'linear-gradient(135deg, #FF1F2E, #8E0E16)'
                      : '#26262B',
                    cursor: email.trim() && !busy ? 'pointer' : 'not-allowed',
                    boxShadow: email.trim() && !busy ? '0 0 16px #FF1F2E33' : 'none',
                  }}
                >
                  {busy ? 'Sending…' : 'Send magic link →'}
                </motion.button>

                <p className="text-center text-xs text-text-lo mt-4 opacity-60">
                  New users get a free Casual account automatically.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="text-center py-4"
              >
                <div className="w-12 h-12 rounded-full bg-ok/10 border border-ok/30 flex items-center justify-center mx-auto mb-4">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10L8 14L16 6" stroke="#28C76F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="text-base font-semibold text-text-hi font-display mb-2">Check your inbox</h2>
                <p className="text-sm text-text-lo leading-relaxed">
                  We sent a sign-in link to<br />
                  <span className="text-text-hi">{email}</span>
                </p>
                <p className="text-xs text-text-lo mt-4 opacity-60">
                  Click the link in the email to open Nano Bricks.
                </p>
                <button
                  onClick={() => setStep('email')}
                  className="mt-4 text-xs text-text-lo hover:text-text-hi transition-colors"
                >
                  Use a different email
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
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
