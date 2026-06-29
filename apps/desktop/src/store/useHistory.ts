import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message } from './useSession';
import { uuid } from '../lib/uuid';
import { deviceStorage, clearStorageKey } from '../lib/storage';

// ── Stored types ──────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  projectId?: string;
  pinned?: boolean;
  archived?: boolean;
  folder?: string;
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
  agentCount?: number;
  createdAt: number;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface HistoryState {
  conversations: Conversation[];
  agentRuns: AgentRunRecord[];

  upsertConversation: (conv: Conversation) => void;
  updateConversationMeta: (id: string, patch: Partial<Pick<Conversation, 'title' | 'pinned' | 'archived' | 'folder'>>) => void;
  deleteConversation: (id: string) => void;
  saveAgentRun: (run: Omit<AgentRunRecord, 'id' | 'createdAt'>) => void;
  deleteAgentRun: (id: string) => void;
  loadAgentRun: (id: string) => void;
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
            // Preserve meta fields that aren't in the auto-saved conv object
            updated[idx] = {
              pinned: updated[idx].pinned,
              archived: updated[idx].archived,
              folder: updated[idx].folder,
              ...conv,
            };
            return { conversations: updated };
          }
          return { conversations: [conv, ...s.conversations] };
        }),

      updateConversationMeta: (id, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, ...patch } : c
          ),
        })),

      deleteConversation: (id) =>
        set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) })),

      saveAgentRun: (run) =>
        set((s) => ({
          agentRuns: [
            { ...run, id: uuid(), createdAt: Date.now() },
            ...s.agentRuns,
          ],
        })),

      deleteAgentRun: (id) =>
        set((s) => ({ agentRuns: s.agentRuns.filter((r) => r.id !== id) })),

      loadAgentRun: (id) => {
        const run = useHistory.getState().agentRuns.find((r) => r.id === id);
        if (!run) return;
        // Lazy imports to avoid circular deps (useSession imports useHistory)
        Promise.resolve().then(async () => {
          const { useSession } = await import('./useSession');
          const { useRun } = await import('./useRun');
          useSession.getState().setMode('agent');
          useRun.setState((s) => ({
            ...s,
            status: 'done',
            query: run.query,
            summary: run.summary,
            tokensUsed: run.tokensUsed,
            agentHistory: [{ query: run.query, response: run.summary }],
          }));
        });
      },

      clearAll: () => set({ conversations: [], agentRuns: [] }),
    }),
    {
      name: 'nano-bricks-history',
      storage: deviceStorage,
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error('[useHistory] Failed to rehydrate, clearing store:', error);
          clearStorageKey('nano-bricks-history').catch(() => {});
        }
      },
      // Defensive: a single malformed conversation must never throw during
      // serialization (which would crash the app via the persist write that
      // runs on saveAgentRun when an agent finishes).
      partialize: (s) => ({
        conversations: (s.conversations ?? []).map((c) => ({
          ...c,
          messages: (c.messages ?? []).map((m) => ({
            ...m,
            streaming: false,
            attachments: Array.isArray(m.attachments)
              ? m.attachments.map((a) =>
                  a.type === 'image'
                    ? { ...a, dataUrl: undefined }
                    : a.type === 'file'
                      ? { ...a, text: a.text?.slice(0, 500) }
                      : a
                )
              : m.attachments,
          })),
        })),
        agentRuns: s.agentRuns ?? [],
      }),
    }
  )
);
