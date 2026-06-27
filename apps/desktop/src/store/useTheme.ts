import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light';
export type FontSize     = 'small' | 'medium' | 'large';
export type FontStyle    = 'system' | 'serif' | 'mono' | 'rounded';
export type BubbleDensity = 'compact' | 'comfortable' | 'spacious';
export type MessageWidth  = 'narrow' | 'medium' | 'wide';

interface ThemeState {
  theme: Theme;
  fontSize: FontSize;
  fontStyle: FontStyle;
  bubbleDensity: BubbleDensity;
  messageWidth: MessageWidth;

  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setFontSize: (v: FontSize) => void;
  setFontStyle: (v: FontStyle) => void;
  setBubbleDensity: (v: BubbleDensity) => void;
  setMessageWidth: (v: MessageWidth) => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      fontSize: 'medium',
      fontStyle: 'system',
      bubbleDensity: 'comfortable',
      messageWidth: 'medium',

      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (t) => set({ theme: t }),
      setFontSize: (v) => set({ fontSize: v }),
      setFontStyle: (v) => set({ fontStyle: v }),
      setBubbleDensity: (v) => set({ bubbleDensity: v }),
      setMessageWidth: (v) => set({ messageWidth: v }),
    }),
    { name: 'nano-bricks-theme' }
  )
);
