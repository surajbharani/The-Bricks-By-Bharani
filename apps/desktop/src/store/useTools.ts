import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ToolDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const TOOL_REGISTRY: ToolDef[] = [
  { id: 'web_search',  name: 'Web Search',       description: 'Search the web and inject results as context for AI replies.', icon: '🔍' },
  { id: 'image_gen',   name: 'Image Generation',  description: 'Generate images with DALL-E 3 or Gemini Imagen right inside chat.', icon: '🎨' },
  { id: 'code_runner', name: 'Code Runner',        description: 'Run Python, Node.js, or Bash snippets from any code block.', icon: '▶' },
];

interface ToolsState {
  enabled: Record<string, boolean>;
  toggleTool: (id: string) => void;
  isEnabled: (id: string) => boolean;
}

export const useTools = create<ToolsState>()(
  persist(
    (set, get) => ({
      enabled: { web_search: true, image_gen: true, code_runner: true },
      toggleTool: (id) =>
        set((s) => ({ enabled: { ...s.enabled, [id]: !s.enabled[id] } })),
      isEnabled: (id) => get().enabled[id] ?? false,
    }),
    { name: 'nano-bricks-tools' }
  )
);
