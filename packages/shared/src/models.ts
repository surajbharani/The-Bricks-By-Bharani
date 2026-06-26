export interface Model {
  id: string;
  label: string;
  description: string;
  provider: 'deepseek' | 'openrouter';
}

export const MODELS: Model[] = [
  {
    id: 'openrouter/owl-alpha',
    label: 'Owl Alpha',
    description: 'Free · 1M context · great for agentic tasks',
    provider: 'openrouter',
  },
  {
    id: 'deepseek/deepseek-chat-v4-flash',
    label: 'Nano Flash',
    description: 'Fast & affordable — best for most tasks',
    provider: 'deepseek',
  },
  {
    id: 'deepseek/deepseek-reasoner',
    label: 'Nano Think',
    description: 'Deep reasoning — best for complex problems',
    provider: 'deepseek',
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o',
    description: 'OpenAI via OpenRouter — fallback option',
    provider: 'openrouter',
  },
];

export const DEFAULT_MODEL = MODELS[0].id;
