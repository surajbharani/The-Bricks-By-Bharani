import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uuid } from '../lib/uuid';

export interface MemoryFact {
  id: string;
  text: string;
  createdAt: number;
}

export interface UserSettings {
  displayName: string;
  globalSystemPrompt: string;
  memoryEnabled: boolean;
}

interface MemoryState {
  settings: UserSettings;
  facts: MemoryFact[];

  updateSettings: (patch: Partial<UserSettings>) => void;
  addFact: (text: string) => void;
  updateFact: (id: string, text: string) => void;
  deleteFact: (id: string) => void;
  clearAllFacts: () => void;
}

export const useMemory = create<MemoryState>()(
  persist(
    (set) => ({
      settings: { displayName: '', globalSystemPrompt: '', memoryEnabled: true },
      facts: [],

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      addFact: (text) =>
        set((s) => ({
          facts: [
            ...s.facts,
            { id: uuid(), text, createdAt: Date.now() },
          ],
        })),

      updateFact: (id, text) =>
        set((s) => ({
          facts: s.facts.map((f) => (f.id === id ? { ...f, text } : f)),
        })),

      deleteFact: (id) =>
        set((s) => ({ facts: s.facts.filter((f) => f.id !== id) })),

      clearAllFacts: () => set({ facts: [] }),
    }),
    { name: 'nano-bricks-memory' }
  )
);
