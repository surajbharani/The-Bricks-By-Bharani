import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MODEL } from '@nano-bricks/shared';
import { useHistory } from './useHistory';

export type AppMode = 'chat' | 'agent';
export type AgentMode = 'solo' | 'swarm';

export interface Attachment {
  type: 'image' | 'file' | 'search' | 'youtube';
  name: string;
  dataUrl?: string;
  text?: string;
  mimeType?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  streaming?: boolean;
  timestamp: number;
  attachments?: Attachment[];
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

  setMode: (mode: AppMode) => void;
  setAgentMode: (agentMode: AgentMode) => void;
  setModel: (model: string) => void;
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
  appendToMessage: (id: string, text: string) => void;
  appendReasoning: (id: string, text: string) => void;
  finalizeMessage: (id: string) => void;
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

function makeId() { return crypto.randomUUID(); }

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

      setMode: (mode) => set({ mode }),
      setAgentMode: (agentMode) => set({ agentMode }),
      setModel: (model) => set({ model }),

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

      finalizeMessage: (id) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, streaming: false } : m
          ),
        }));
        // Auto-save conversation to history after each completed AI reply
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
            createdAt: finalized[0]?.timestamp ?? Date.now(),
            updatedAt: Date.now(),
          });
        }
      },

      newConversation: () => {
        const s = get();
        // Save current conversation before clearing (if it has any messages)
        if (s.messages.some((m) => m.role === 'user')) {
          useHistory.getState().upsertConversation({
            id: s.conversationId,
            title: deriveTitle(s.messages),
            messages: s.messages,
            model: s.model,
            createdAt: s.messages[0]?.timestamp ?? Date.now(),
            updatedAt: Date.now(),
          });
        }
        set({ conversationId: makeId(), messages: [], isStreaming: false });
      },

      loadConversation: (id) => {
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
      partialize: (s) => ({
        conversationId: s.conversationId,
        mode: s.mode,
        agentMode: s.agentMode,
        model: s.model,
        // Persist active messages so the current in-progress chat survives restart
        messages: s.messages.map((m) => ({ ...m, streaming: false })),
        thinking: s.thinking,
        canvas: s.canvas,
        showCanvas: s.showCanvas,
      }),
    }
  )
);
