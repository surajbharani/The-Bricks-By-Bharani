import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message } from './useSession';

// ── Stored types ──────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;      // first user message, truncated
  messages: Message[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentRunRecord {
  id: string;
  query: string;
  summary: string;
  status: 'done' | 'error';
  tokensUsed: number;
  model: string;
  createdAt: number;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface HistoryState {
  conversations: Conversation[];
  agentRuns: AgentRunRecord[];

  upsertConversation: (conv: Conversation) => void;
  deleteConversation: (id: string) => void;
  saveAgentRun: (run: Omit<AgentRunRecord, 'id' | 'createdAt'>) => void;
  deleteAgentRun: (id: string) => void;
  clearAll: () => void;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      conversations: [],
      agentRuns: [],

      upsertConversation: (conv) =>
        set((s) => {
          const idx = s.conversations.findIndex((c) => c.id === conv.id);
          if (idx >= 0) {
            const updated = [...s.conversations];
            updated[idx] = conv;
            return { conversations: updated };
          }
          return { conversations: [conv, ...s.conversations] };
        }),

      deleteConversation: (id) =>
        set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) })),

      saveAgentRun: (run) =>
        set((s) => ({
          agentRuns: [
            { ...run, id: crypto.randomUUID(), createdAt: Date.now() },
            ...s.agentRuns,
          ],
        })),

      deleteAgentRun: (id) =>
        set((s) => ({ agentRuns: s.agentRuns.filter((r) => r.id !== id) })),

      clearAll: () => set({ conversations: [], agentRuns: [] }),
    }),
    {
      name: 'nano-bricks-history',
      // Strip base64 image data from archived messages to avoid exceeding localStorage quota
      partialize: (s) => ({
        conversations: s.conversations.map((c) => ({
          ...c,
          messages: c.messages.map((m) => ({
            ...m,
            streaming: false, // never persist streaming state
            attachments: m.attachments?.map((a) =>
              a.type === 'image'
                ? { ...a, dataUrl: undefined }
                : a.type === 'file'
                  ? { ...a, text: a.text?.slice(0, 500) }
                  : a
            ),
          })),
        })),
        agentRuns: s.agentRuns,
      }),
    }
  )
);
