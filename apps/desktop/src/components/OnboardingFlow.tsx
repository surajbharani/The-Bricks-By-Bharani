import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useOnboarding } from '../store/useOnboarding';

const STEPS = [
  {
    title: 'Welcome to Nano Bricks',
    subtitle: 'Your AI-powered assistant, right on your desktop.',
    body: 'Fast, private, and built for real work. Let\'s take a quick tour.',
    icon: '🧱',
  },
  {
    title: 'Chat Mode',
    subtitle: 'Talk to AI naturally.',
    body: 'Ask questions, get explanations, summarize documents, and more — just like texting a brilliant friend.',
    icon: '💬',
  },
  {
    title: 'Agent Mode',
    subtitle: 'Let AI do the heavy lifting.',
    body: 'Switch to Agent mode and let Nano Bricks autonomously complete complex multi-step tasks for you.',
    icon: '🤖',
  },
  {
    title: 'You\'re all set!',
    subtitle: 'Start building something amazing.',
    body: 'Your AI agent is ready. Hit the button below to jump straight in.',
    icon: '🚀',
  },
];

export function OnboardingFlow() {
  const { completeOnboarding } = useOnboarding();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const goNext = () => {
    if (step === STEPS.length - 1) { completeOnboarding(); return; }
    setDirection(1);
    setStep((s) => s + 1);
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => s - 1);
  };

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 bg-bg-void flex items-center justify-center">
      {/* Skip button */}
      <button
        onClick={completeOnboarding}
        className="absolute top-6 right-6 text-xs text-text-lo hover:text-text-hi transition-colors"
      >
        Skip →
      </button>

      <div className="relative w-full max-w-lg mx-auto px-6">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={{
              enter: (d: number) => ({ x: d * 60, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d * -60, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="bg-bg-panel border border-border-hair rounded-2xl p-8 text-center shadow-2xl"
          >
            <div className="text-5xl mb-5">{current.icon}</div>
            <h1 className="text-xl font-display font-bold text-text-hi mb-2">{current.title}</h1>
            <p className="text-sm font-semibold text-red-core mb-3">{current.subtitle}</p>
            <p className="text-sm text-text-lo leading-relaxed">{current.body}</p>
          </motion.div>
        </AnimatePresence>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 mt-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-red-core' : 'w-1.5 bg-border-hair'
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={goBack}
            disabled={step === 0}
            className="px-4 py-2 text-sm text-text-lo hover:text-text-hi border border-border-hair rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Back
          </button>
          <button
            onClick={goNext}
            className="px-6 py-2 text-sm font-semibold bg-red-core text-white rounded-lg hover:bg-red-core/90 transition-colors"
          >
            {step === STEPS.length - 1 ? 'Start chatting →' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
