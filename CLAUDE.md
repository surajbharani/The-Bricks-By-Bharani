# Nano Bricks — project memory for Claude Code

## Locked decisions
| Topic | Decision |
|---|---|
| Client | Tauri 2 (Rust shell) + React 18 + TypeScript + Tailwind + Vite |
| UI theme | Futuristic **black & red** (logo colors) |
| Modes | Chat ↔ Agent toggle; Agent has Solo / Swarm |
| Inference | Cloud-only v1 → Cloudflare Worker proxy → DeepSeek V4 Flash (+ OpenRouter fallback) |
| Agent engine | Fork of Hermes Agent (MIT), rebranded as Agent Nano Bricks, one-shot, runs as local sidecar |
| Auth / usage | Supabase |
| Payments | Razorpay (INR, UPI) |
| Backend hosting | Serverless (Cloudflare Pages/Vercel + Workers); no VPS |
| Targets | Windows .exe + macOS .dmg, signed, auto-updating, self-contained |
| Audience | Non-technical users only |

## Names
- APP_NAME = Nano Bricks
- AGENT_NAME = Agent Nano Bricks
- BRAND_DOMAIN = nanobricks.app
- PROXY_DOMAIN = api.nanobricks.app

## Layout
```
The-Bricks-By-Bharani/        # MAIN APP repo
├─ apps/
│  ├─ desktop/        # Tauri + React client            (Phase 1, 8)
│  └─ landing/        # Marketing site + Razorpay        (Phase 10)
├─ services/
│  └─ proxy/          # Cloudflare Worker                (Phase 2)
├─ engine/            # submodule / built artifact of Agent-Bricks (consumed, not edited here)
│  └─ agent-nano-bricks/
├─ packages/
│  └─ shared/         # Shared TS types (events, tiers, models)
├─ supabase/          # SQL migrations + RLS             (Phase 3)
├─ CLAUDE.md          # Project memory
└─ MASTER_BUILD_PLAN.md
```

## Hard rules
- Master keys live ONLY in Cloudflare Worker secrets. Never print/commit/embed.
- Build one phase at a time; pass "Done when" before continuing.
- Every user-facing string is plain English for non-technical users.
- Ask before destructive ops; show diffs.

## Event contract (AgentEvent — packages/shared/agentEvents.ts)
```ts
export type AgentEvent =
  | { t: 'plan';        steps: string[] }
  | { t: 'thinking';    text: string }
  | { t: 'step';        i: number; label: string; status: 'run'|'ok'|'fail' }
  | { t: 'tool_call';   name: string; inputSummary: string }
  | { t: 'tool_result'; name: string; outputSummary: string; ok: boolean }
  | { t: 'file';        path: string; action: 'write'|'edit' }
  | { t: 'token';       text: string }
  | { t: 'subagent';    id: string; brick: string; status: 'spawned'|'working'|'done'; summary?: string }
  | { t: 'spend';       tokens: number; inr: number }
  | { t: 'done';        ok: boolean; summary: string; tokensUsed: number }
  | { t: 'error';       message: string };
```

## Status log
- [x] P0 orientation + CLAUDE.md
- [x] P1 shell (Chat↔Agent, Solo/Swarm, model dropdown, black/red UI)
- [x] P2 proxy (Cloudflare Worker)
- [x] P3 supabase (auth, tiers, usage)
- [ ] P4 fork+debrand (Agent-Bricks repo)
- [ ] P5 mindset+solo (Agent-Bricks repo)
- [ ] P6 swarm (Agent-Bricks repo)
- [ ] P7 sidecar (Agent-Bricks repo)
- [ ] P8 timeline dashboard
- [ ] P9 installers
- [ ] P10 razorpay + landing
- [ ] P11 hardening
