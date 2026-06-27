export interface Model {
  id: string;
  label: string;
  description: string;
  provider: 'deepseek' | 'openrouter';
  reasoning?: boolean;
}

export const MODELS: Model[] = [
  {
    id: 'openrouter/owl-alpha',
    label: 'Owl Alpha',
    description: "OpenRouter's own model — fast and capable",
    provider: 'openrouter',
  },
  {
    id: 'deepseek/deepseek-chat',
    label: 'Nano Flash',
    description: 'Fast & smart — best for most tasks',
    provider: 'deepseek',
  },
];

export const DEFAULT_MODEL = MODELS[0].id;
