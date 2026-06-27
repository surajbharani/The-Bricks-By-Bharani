import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingState {
  completed: boolean;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      completeOnboarding: () => set({ completed: true }),
      resetOnboarding: () => set({ completed: false }),
    }),
    { name: 'nano-bricks-onboarding' }
  )
);
