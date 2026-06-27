export interface Model {
  id: string;
  label: string;
  description: string;
  provider: 'deepseek' | 'openrouter';
  reasoning?: boolean;
}

export const MODELS: Model[] = [
  {
    id: 'deepseek/deepseek-chat',
    label: 'Nano Flash',
    description: 'Fast & smart — best for most tasks',
    provider: 'deepseek',
  },
  {
    id: 'deepseek/deepseek-reasoner',
    label: 'Nano Think',
    description: 'Deep reasoning — best for complex problems',
    provider: 'deepseek',
    reasoning: true,
  },
  {
    id: 'openrouter/owl-alpha',
    label: 'Owl Alpha',
    description: "OpenRouter's own model — fast and capable",
    provider: 'openrouter',
  },
  {
    id: 'openrouter/google/gemini-2.0-flash-exp:free',
    label: 'Gemini Flash',
    description: 'Free · 1M context · great for agentic tasks',
    provider: 'openrouter',
  },
  {
    id: 'openrouter/meta-llama/llama-3.3-70b-instruct:free',
    label: 'Llama 3.3 70B',
    description: 'Free · 128k context · strong reasoning',
    provider: 'openrouter',
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o',
    description: 'OpenAI via OpenRouter — premium option',
    provider: 'openrouter',
  },
];

export const DEFAULT_MODEL = MODELS[0].id;
