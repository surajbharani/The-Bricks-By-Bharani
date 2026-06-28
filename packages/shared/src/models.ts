export interface Model {
  id: string;
  label: string;
  description: string;
  provider: 'deepseek' | 'openrouter';
  reasoning?: boolean;
}

export const MODELS: Model[] = [
  {
    id: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek Flash',
    description: 'Fast & smart — best for everyday tasks',
    provider: 'deepseek',
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    label: 'DeepSeek Pro',
    description: 'Most powerful — best for complex work',
    provider: 'deepseek',
    reasoning: true,
  },
  {
    id: 'openrouter/owl-alpha',
    label: 'Owl Alpha',
    description: "OpenRouter's own model — fast and capable",
    provider: 'openrouter',
  },
];

export const DEFAULT_MODEL = MODELS[0].id;
