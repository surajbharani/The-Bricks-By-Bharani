import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

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
      typography: {
        DEFAULT: {
          css: {
            color: '#F4F4F6',
            a: { color: '#FF1F2E', '&:hover': { color: '#FF1F2E' } },
            strong: { color: '#F4F4F6' },
            h1: { color: '#F4F4F6' },
            h2: { color: '#F4F4F6' },
            h3: { color: '#F4F4F6' },
            h4: { color: '#F4F4F6' },
            code: { color: '#F4F4F6', background: '#1A1A1E', borderRadius: '4px', padding: '2px 4px' },
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
            blockquote: { color: '#8A8A93', borderLeftColor: '#26262B' },
            hr: { borderColor: '#26262B' },
            thead: { borderBottomColor: '#26262B' },
            'tbody tr': { borderBottomColor: '#26262B' },
            th: { color: '#F4F4F6' },
          },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
