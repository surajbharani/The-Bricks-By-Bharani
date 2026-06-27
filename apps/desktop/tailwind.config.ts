import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-void': 'var(--bg-void)',
        'bg-panel': 'var(--bg-panel)',
        'bg-elevated': 'var(--bg-elevated)',
        'border-hair': 'var(--border-hair)',
        'red-core': 'var(--red-core)',
        'red-glow': 'var(--red-glow)',
        'red-deep': 'var(--red-deep)',
        ok: 'var(--ok)',
        'text-hi': 'var(--text-hi)',
        'text-lo': 'var(--text-lo)',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'red-glow': '0 0 16px 2px var(--red-glow)',
        'red-glow-lg': '0 0 32px 4px var(--red-glow)',
      },
      typography: {
        DEFAULT: {
          css: {
            color: 'var(--text-hi)',
            a: { color: 'var(--red-core)', '&:hover': { color: 'var(--red-core)' } },
            strong: { color: 'var(--text-hi)' },
            h1: { color: 'var(--text-hi)' },
            h2: { color: 'var(--text-hi)' },
            h3: { color: 'var(--text-hi)' },
            h4: { color: 'var(--text-hi)' },
            code: { color: 'var(--text-hi)', background: 'var(--bg-elevated)', borderRadius: '4px', padding: '2px 4px' },
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
            blockquote: { color: 'var(--text-lo)', borderLeftColor: 'var(--border-hair)' },
            hr: { borderColor: 'var(--border-hair)' },
            thead: { borderBottomColor: 'var(--border-hair)' },
            'tbody tr': { borderBottomColor: 'var(--border-hair)' },
            th: { color: 'var(--text-hi)' },
          },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
