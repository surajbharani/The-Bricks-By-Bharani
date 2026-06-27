import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MODEL } from '@nano-bricks/shared';

export type AppMode = 'chat' | 'agent';
export type AgentMode = 'solo' | 'swarm';

export interface Attachment {
  type: 'image' | 'file' | 'search' | 'youtube';
  name: string;
  dataUrl?: string;   // base64 data URL for images
  text?: string;      // extracted text (files) or formatted context (search)
  mimeType?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  timestamp: number;
  attachments?: Attachment[];
}

interface SessionState {
  mode: AppMode;
  agentMode: AgentMode;
  model: string;
  messages: Message[];
  isStreaming: boolean;

  setMode: (mode: AppMode) => void;
  setAgentMode: (agentMode: AgentMode) => void;
  setModel: (model: string) => void;
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
  appendToMessage: (id: string, text: string) => void;
  finalizeMessage: (id: string) => void;
  clearMessages: () => void;
  setStreaming: (v: boolean) => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      mode: 'chat',
      agentMode: 'solo',
      model: DEFAULT_MODEL,
      messages: [],
      isStreaming: false,

      setMode: (mode) => set({ mode }),
      setAgentMode: (agentMode) => set({ agentMode }),
      setModel: (model) => set({ model }),

      addMessage: (msg) => {
        const id = crypto.randomUUID();
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

      finalizeMessage: (id) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, streaming: false } : m
          ),
        })),

      clearMessages: () => set({ messages: [] }),
      setStreaming: (isStreaming) => set({ isStreaming }),
    }),
    {
      name: 'nano-bricks-session',
      partialize: (s) => ({ mode: s.mode, agentMode: s.agentMode, model: s.model }),
    }
  )
);
