import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MODEL } from '@nano-bricks/shared';
import { useHistory } from './useHistory';
import { useProjects } from './useProjects';
import { useRun } from './useRun';
import { uuid } from '../lib/uuid';

export type AppMode = 'chat' | 'agent';
export type AgentMode = 'solo' | 'swarm';

export interface WebSource {
  title: string;
  snippet: string;
  url: string;
  domain: string;
}

export interface Attachment {
  type: 'image' | 'image-gen' | 'image-upload' | 'file' | 'search' | 'youtube' | 'web-search';
  name?: string;
  dataUrl?: string;
  text?: string;
  mimeType?: string;
  url?: string;
  prompt?: string;
  webStatus?: 'searching' | 'reading' | 'answering' | 'done';
  query?: string;
  sources?: WebSource[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  streaming?: boolean;
  timestamp: number;
  attachments?: Attachment[];
  feedback?: 'like' | 'dislike';
  branches?: string[];    // alternative response texts
  branchIndex?: number;   // which branch is currently displayed
}

export interface ThinkingConfig {
  enabled: boolean;
  showSteps: boolean;
  budget: 'fast' | 'thorough';
}

export interface CanvasDoc {
  title: string;
  content: string;
}

export type ResponseLength = 'auto' | 'short' | 'medium' | 'long';

interface SessionState {
  conversationId: string;
  mode: AppMode;
  agentMode: AgentMode;
  model: string;
  messages: Message[];
  isStreaming: boolean;
  thinking: ThinkingConfig;
  canvas: CanvasDoc;
  showCanvas: boolean;
  responseLength: ResponseLength;
  regeneratePayload: string | null;

  setMode: (mode: AppMode) => void;
  setAgentMode: (agentMode: AgentMode) => void;
  setActiveProject: (id: string | null) => void;
  setModel: (model: string) => void;
  setResponseLength: (v: ResponseLength) => void;
  setRegeneratePayload: (v: string | null) => void;
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
  appendToMessage: (id: string, text: string) => void;
  appendReasoning: (id: string, text: string) => void;
  updateMessage: (id: string, updates: Partial<Omit<Message, 'id'>>) => void;
  finalizeMessage: (id: string) => void;
  setFeedback: (id: string, feedback: 'like' | 'dislike') => void;
  addBranch: (id: string, text: string) => void;
  setBranchIndex: (id: string, index: number) => void;
  regenerate: () => void;
  editAndResend: (userMsgId: string, newContent: string) => void;
  /** Archive current conversation to history, then start fresh */
  newConversation: () => void;
  /** Load a past conversation from history into the active session */
  loadConversation: (id: string) => void;
  clearMessages: () => void;
  setStreaming: (v: boolean) => void;
  setThinking: (patch: Partial<ThinkingConfig>) => void;
  setShowCanvas: (v: boolean) => void;
  updateCanvas: (patch: Partial<CanvasDoc>) => void;
}

function makeId() { return uuid(); }

function deriveTitle(messages: Message[]): string {
  const first = messages.find((m) => m.role === 'user' && m.content.trim());
  return first ? first.content.slice(0, 60) : 'New conversation';
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      conversationId: makeId(),
      mode: 'chat',
      agentMode: 'solo',
      model: DEFAULT_MODEL,
      messages: [],
      isStreaming: false,
      thinking: { enabled: false, showSteps: true, budget: 'fast' },
      canvas: { title: 'Untitled', content: '' },
      showCanvas: false,
      responseLength: 'auto',
      regeneratePayload: null,

      setMode: (mode) => set({ mode }),
      setAgentMode: (agentMode) => set({ agentMode }),
      setModel: (model) => set({ model }),
      setResponseLength: (responseLength) => set({ responseLength }),
      setRegeneratePayload: (regeneratePayload) => set({ regeneratePayload }),

      setActiveProject: (id) => {
        const s = get();
        if (s.messages.some((m) => m.role === 'user')) {
          useHistory.getState().upsertConversation({
            id: s.conversationId,
            title: deriveTitle(s.messages),
            messages: s.messages,
            model: s.model,
            projectId: useProjects.getState().activeProjectId ?? undefined,
            createdAt: s.messages[0]?.timestamp ?? Date.now(),
            updatedAt: Date.now(),
          });
        }
        useProjects.getState().setActiveProject(id);
        set({ conversationId: makeId(), messages: [], isStreaming: false });
      },

      addMessage: (msg) => {
        const id = makeId();
        set((s) => ({
          messages: [...s.messages, { ...msg, id, timestamp: Date.now() }],
        }));
        return id;
      },

      appendToMessage: (id, text) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, content: m.content + text } : m
          ),
        })),

      appendReasoning: (id, text) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, reasoning: (m.reasoning ?? '') + text } : m
          ),
        })),

      updateMessage: (id, updates) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),

      finalizeMessage: (id) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, streaming: false } : m
          ),
        }));
        const s = get();
        const finalized = s.messages.map((m) =>
          m.id === id ? { ...m, streaming: false } : m
        );
        if (finalized.some((m) => m.role === 'user')) {
          useHistory.getState().upsertConversation({
            id: s.conversationId,
            title: deriveTitle(finalized),
            messages: finalized,
            model: s.model,
            projectId: useProjects.getState().activeProjectId ?? undefined,
            createdAt: finalized[0]?.timestamp ?? Date.now(),
            updatedAt: Date.now(),
          });
        }
      },

      setFeedback: (id, feedback) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, feedback: m.feedback === feedback ? undefined : feedback } : m
          ),
        })),

      addBranch: (id, text) =>
        set((s) => ({
          messages: s.messages.map((m) => {
            if (m.id !== id) return m;
            const branches = m.branches ?? [m.content];
            const newBranches = [...branches, text];
            return { ...m, branches: newBranches, branchIndex: newBranches.length - 1, content: text };
          }),
        })),

      setBranchIndex: (id, index) =>
        set((s) => ({
          messages: s.messages.map((m) => {
            if (m.id !== id || !m.branches) return m;
            const clamped = Math.max(0, Math.min(index, m.branches.length - 1));
            return { ...m, branchIndex: clamped, content: m.branches[clamped] };
          }),
        })),

      regenerate: () => {
        const s = get();
        const msgs = s.messages;
        // Find last user message (not streaming)
        let lastUserContent = '';
        let lastAsstIdx = -1;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant' && lastAsstIdx < 0) lastAsstIdx = i;
          if (msgs[i].role === 'user' && !msgs[i].streaming) {
            lastUserContent = msgs[i].content;
            break;
          }
        }
        if (!lastUserContent || lastAsstIdx < 0) return;
        set({
          messages: msgs.filter((_, i) => i !== lastAsstIdx),
          regeneratePayload: lastUserContent,
        });
      },

      editAndResend: (userMsgId, newContent) => {
        const s = get();
        const idx = s.messages.findIndex((m) => m.id === userMsgId);
        if (idx < 0) return;
        set({ messages: s.messages.slice(0, idx), regeneratePayload: newContent });
      },

      newConversation: () => {
        const s = get();
        if (s.messages.some((m) => m.role === 'user')) {
          useHistory.getState().upsertConversation({
            id: s.conversationId,
            title: deriveTitle(s.messages),
            messages: s.messages,
            model: s.model,
            projectId: useProjects.getState().activeProjectId ?? undefined,
            createdAt: s.messages[0]?.timestamp ?? Date.now(),
            updatedAt: Date.now(),
          });
        }
        // Reset the agent conversation thread too, so "New conversation" starts fresh in both modes
        useRun.getState().clearAgentHistory();
        set({ conversationId: makeId(), messages: [], isStreaming: false });
      },

      loadConversation: (id) => {
        const s = get();
        if (s.messages.some((m) => m.role === 'user')) {
          useHistory.getState().upsertConversation({
            id: s.conversationId,
            title: deriveTitle(s.messages),
            messages: s.messages,
            model: s.model,
            projectId: useProjects.getState().activeProjectId ?? undefined,
            createdAt: s.messages[0]?.timestamp ?? Date.now(),
            updatedAt: Date.now(),
          });
        }
        const conv = useHistory.getState().conversations.find((c) => c.id === id);
        if (!conv) return;
        set({
          conversationId: conv.id,
          messages: conv.messages,
          model: conv.model,
          isStreaming: false,
          mode: 'chat',
        });
      },

      clearMessages: () => set({ messages: [], isStreaming: false }),

      setStreaming: (isStreaming) => set({ isStreaming }),
      setThinking: (patch) =>
        set((s) => ({ thinking: { ...s.thinking, ...patch } })),
      setShowCanvas: (showCanvas) => set({ showCanvas }),
      updateCanvas: (patch) =>
        set((s) => ({ canvas: { ...s.canvas, ...patch } })),
    }),
    {
      name: 'nano-bricks-session',
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error('[useSession] Failed to rehydrate, clearing store:', error);
          localStorage.removeItem('nano-bricks-session');
        }
      },
      partialize: (s) => ({
        conversationId: s.conversationId,
        mode: s.mode,
        agentMode: s.agentMode,
        model: s.model,
        messages: s.messages.map((m) => ({ ...m, streaming: false })),
        thinking: s.thinking,
        canvas: s.canvas,
        showCanvas: s.showCanvas,
        responseLength: s.responseLength,
        // Never persist regeneratePayload
      }),
    }
  )
);
