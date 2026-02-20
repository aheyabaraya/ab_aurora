# Environment Setup

Canonical workspace root: `/Users/yuminseog/ab_aurora`.

Branch policy:
- production: `main`
- preview/canary: `develop`

---

## 1) Local bootstrap

1. Copy `.env.example` to `.env.local`.
2. Fill required values.
3. Run:
```bash
pnpm install
pnpm dev
```

---

## 2) Core runtime variables

- `NODE_ENV`
  - default: `development`
- `APP_URL`
  - local: `http://localhost:3000`
- `AGENT_UI_MODE`
  - default: `agent_stage`
  - valid: `agent_stage|chat_flat`
- `AUTO_CONTINUE`
  - default: `true`
- `AUTO_PICK_TOP1`
  - default: `true`
- `ENABLE_AGENT_CHAT_CONTROL`
  - default: `true`
- `OPENAI_FALLBACK_MODE`
  - default: `deterministic_mock`
  - valid: `deterministic_mock|none`

### Runtime control-plane
- `RUNTIME_ENABLED`
  - default: `false`
- `RUNTIME_MAX_ITERATIONS`
  - default: `12`
- `RUNTIME_REPLAN_LIMIT`
  - default: `2`
- `RUNTIME_TOOL_TIMEOUT_MS`
  - default: `30000`
- `RUNTIME_MEMORY_PERSIST`
  - default: `true`
- `RUNTIME_EVAL_MIN_SCORE`
  - default: `0.8`

### Intent/candidate guardrails
- `INTENT_CLARIFY_THRESHOLD` (default `4`, valid `1..5`)
- `CANDIDATE_COUNT` (default `20`)
- `TOP_K` (default `3`)
- `MAX_REVISIONS` (default `2`)
- `MAX_SELF_HEAL_ATTEMPTS` (default `3`)

### Limits
- `CONCURRENT_JOB_LIMIT` (default `1`)
- `REQUEST_LIMIT_PER_DAY` (default `100`)
- `IMAGE_LIMIT_PER_DAY` (default `20`)
- `SESSION_RETENTION_DAYS` (default `30`)

---

## 3) Security variables

- `API_BEARER_TOKEN`
  - shared value used by `x-api-token` header
- `API_TOKEN_REQUIRED`
  - default: `false`
  - production recommendation: `true`
- `SECURITY_HEADERS_STRICT`
  - default: `true`

Server-only secrets must never use `NEXT_PUBLIC_`.

---

## 4) Supabase variables (required)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)

Required migrations:
1. `infra/supabase/migrations/20260219_agent_runtime.sql`
2. `infra/supabase/migrations/20260220_runtime_control_plane.sql`

---

## 5) OpenAI variables

- `OPENAI_API_KEY` (optional when fallback mode is active)
- `OPENAI_MODEL_TEXT` (default `gpt-4o`)
- `OPENAI_MODEL_IMAGE` (default `gpt-image-1`)

---

## 6) Optional Monad mint

- `ENABLE_MONAD_MINT` (default `false`)
- `NEXT_PUBLIC_MONAD_CHAIN_ID` (default `10143`)
- `MONAD_CHAIN_ID` (default `10143`)
- `MONAD_PUBLIC_RPC_URL` (default `https://testnet-rpc.monad.xyz`)
- `MONAD_EXPLORER_URL` (default `https://testnet.monadexplorer.com`)
- `MONAD_RPC_URL` (optional)
- `MONAD_PRIVATE_KEY` (optional, server-only)

---

## 7) Deployment matrix

### Development (local)
- `RUNTIME_ENABLED=true`
- `API_TOKEN_REQUIRED=false`
- `OPENAI_FALLBACK_MODE=deterministic_mock`

### Preview (`develop`)
- `RUNTIME_ENABLED=true`
- `API_TOKEN_REQUIRED=false` (or team policy)
- `SECURITY_HEADERS_STRICT=true`

### Production (`main`) phase rollout
- Phase 1:
  - `RUNTIME_ENABLED=false`
  - `API_TOKEN_REQUIRED=true`
  - `SECURITY_HEADERS_STRICT=true`
- Phase 2 after smoke:
  - `RUNTIME_ENABLED=true`
  - keep token/security strict flags enabled

Rollback switch:
- set `RUNTIME_ENABLED=false`

---

## 8) Vercel setup

Vercel Console path:
- `Project -> Settings -> Environment Variables`

Set all required keys for scopes:
- `Development`
- `Preview`
- `Production`

Build branch rules:
- production branch: `main`
- preview branch: `develop`
