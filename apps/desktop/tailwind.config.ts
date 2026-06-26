import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-void': '#0A0A0B',
        'bg-panel': '#121214',
        'bg-elevated': '#1A1A1E',
        'border-hair': '#26262B',
        'red-core': '#FF1F2E',
        'red-glow': '#FF1F2E55',
        'red-deep': '#8E0E16',
        ok: '#28C76F',
        'text-hi': '#F4F4F6',
        'text-lo': '#8A8A93',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'red-glow': '0 0 16px 2px #FF1F2E55',
        'red-glow-lg': '0 0 32px 4px #FF1F2E55',
      },
    },
  },
  plugins: [],
};

export default config;
