# Deploying the Nano Bricks Proxy

## One-time setup

```bash
cd services/proxy
pnpm install

# Create the KV namespace for rate limiting
wrangler kv:namespace create RATE_LIMIT_KV
# → paste the returned id into wrangler.toml [[kv_namespaces]] id = "..."

# Set secrets (never in wrangler.toml)
wrangler secret put DEEPSEEK_KEY
wrangler secret put OPENROUTER_KEY
wrangler secret put SUPABASE_JWT_SECRET      # from Supabase → Settings → API → JWT Secret
wrangler secret put SUPABASE_SERVICE_ROLE_KEY  # from Supabase → Settings → API → service_role
```

Edit `wrangler.toml` [vars]:
- `SUPABASE_URL` = your Supabase project URL

## Local dev

```bash
# Create .dev.vars with secrets for local testing (never commit this file)
cat > .dev.vars <<EOF
DEEPSEEK_KEY=sk-...
OPENROUTER_KEY=sk-or-...
SUPABASE_JWT_SECRET=...
SUPABASE_SERVICE_ROLE_KEY=...
EOF

pnpm dev   # → http://localhost:8787
```

## Deploy

```bash
pnpm deploy
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/v1/chat` | Chat completions — requires Bearer JWT |

## Cap testing

```bash
# Test auth rejection
curl -X POST http://localhost:8787/v1/chat -H "Content-Type: application/json" \
  -d '{"model":"deepseek/deepseek-v4-flash","messages":[{"role":"user","content":"hi"}]}'
# → 401

# Test with real JWT
curl -X POST http://localhost:8787/v1/chat \
  -H "Authorization: Bearer <supabase-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek/deepseek-v4-flash","messages":[{"role":"user","content":"Say hi"}]}' \
  --no-buffer
```

## Phase 3 dependency

The proxy reads from and writes to these Supabase tables (created in Phase 3):
- `subscriptions` — to look up active tier
- `tiers` — daily_token_cap, monthly_inr_cap
- `usage_daily` — today's token+₹ usage (upserted via `rpc/upsert_usage_daily`)

The RPC function `upsert_usage_daily` must be created in Phase 3 migrations.
