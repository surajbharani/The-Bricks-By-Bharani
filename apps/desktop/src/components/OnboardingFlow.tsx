import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboarding } from '../store/useOnboarding';

const STEPS = [
  {
    title: 'Welcome to Nano Bricks',
    subtitle: 'Your AI-powered assistant, right on your desktop.',
    body: 'Fast, private, and built for real work. Let\'s take a quick tour.',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#FF1F2E" fillOpacity="0.12" />
        <rect x="10" y="10" width="12" height="12" rx="2" fill="#FF1F2E" />
        <rect x="26" y="10" width="12" height="12" rx="2" fill="#FF1F2E" fillOpacity="0.5" />
        <rect x="10" y="26" width="12" height="12" rx="2" fill="#FF1F2E" fillOpacity="0.5" />
        <rect x="26" y="26" width="12" height="12" rx="2" fill="#FF1F2E" />
      </svg>
    ),
  },
  {
    title: 'Chat Mode',
    subtitle: 'Talk to AI naturally.',
    body: 'Ask questions, get explanations, write code or content — all in a clean chat interface with markdown and code highlighting.',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#FF1F2E" fillOpacity="0.12" />
        <path d="M10 14a2 2 0 0 1 2-2h24a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H20l-7 4v-4h-1a2 2 0 0 1-2-2V14z"
          stroke="#FF1F2E" strokeWidth="2" fill="none" strokeLinejoin="round" />
        <line x1="16" y1="20" x2="32" y2="20" stroke="#FF1F2E" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="26" x2="26" y2="26" stroke="#FF1F2E" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Agent Mode',
    subtitle: 'Let AI do the heavy lifting.',
    body: 'Switch to Agent to run autonomous tasks. Use Solo for single-agent focus or Swarm to break complex jobs across multiple agents in parallel.',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#FF1F2E" fillOpacity="0.12" />
        <circle cx="24" cy="18" r="5" stroke="#FF1F2E" strokeWidth="2" fill="none" />
        <circle cx="14" cy="32" r="4" stroke="#FF1F2E" strokeWidth="2" fill="none" strokeOpacity="0.6" />
        <circle cx="34" cy="32" r="4" stroke="#FF1F2E" strokeWidth="2" fill="none" strokeOpacity="0.6" />
        <line x1="24" y1="23" x2="14" y2="28" stroke="#FF1F2E" strokeWidth="1.5" strokeOpacity="0.5" />
        <line x1="24" y1="23" x2="34" y2="28" stroke="#FF1F2E" strokeWidth="1.5" strokeOpacity="0.5" />
      </svg>
    ),
  },
  {
    title: "You're all set!",
    subtitle: 'Start building with Nano Bricks.',
    body: 'Your first conversation is waiting. You can always find settings, shortcuts, and more in the sidebar.',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#28C76F" fillOpacity="0.12" />
        <path d="M14 24l8 8 12-14" stroke="#28C76F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
];

export function OnboardingFlow() {
  const { completeOnboarding } = useOnboarding();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-void">
      {/* Subtle dot grid */}
      <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />

      {/* Skip */}
      <button
        onClick={completeOnboarding}
        className="absolute top-5 right-5 text-xs text-text-lo hover:text-text-hi transition-colors"
      >
        Skip →
      </button>

      {/* Card */}
      <div className="relative w-full max-w-md mx-4">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ x: direction * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -60, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="bg-bg-panel border border-border-hair rounded-2xl p-8 shadow-2xl"
          >
            {/* Icon */}
            <div className="mb-6">{current.icon}</div>

            {/* Text */}
            <h1 className="text-xl font-semibold text-text-hi mb-1">{current.title}</h1>
            <p className="text-sm font-medium text-red-core mb-3">{current.subtitle}</p>
            <p className="text-sm text-text-lo leading-relaxed">{current.body}</p>

            {/* Actions */}
            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={() => go(step - 1)}
                disabled={step === 0}
                className="text-xs text-text-lo hover:text-text-hi disabled:opacity-0 transition-colors"
              >
                ← Back
              </button>

              {/* Dots */}
              <div className="flex gap-1.5">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => go(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      i === step ? 'bg-red-core w-4' : 'bg-border-hair hover:bg-text-lo'
                    }`}
                  />
                ))}
              </div>

              {isLast ? (
                <button
                  onClick={completeOnboarding}
                  className="text-xs font-semibold px-4 py-2 rounded-lg bg-red-core text-white hover:opacity-90 transition-opacity"
                >
                  Start chatting →
                </button>
              ) : (
                <button
                  onClick={() => go(step + 1)}
                  className="text-xs font-semibold px-4 py-2 rounded-lg bg-red-core text-white hover:opacity-90 transition-opacity"
                >
                  Next →
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
