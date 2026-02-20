# Environment Setup

This project is configured to run with `main` as release branch and `develop` as development branch.
Canonical workspace root is `/Users/yuminseog/ab_aurora`.

## Local setup
1. Copy `.env.example` to `.env.local`.
2. Fill values needed for your environment.
3. Run:
```bash
pnpm install
pnpm dev
```

## Variables

### Core runtime
- `NODE_ENV`:
  - default: `development`
- `APP_URL`:
  - local: `http://localhost:3000`
- `AGENT_UI_MODE`:
  - default: `agent_stage`
  - valid: `agent_stage|chat_flat`
- `AUTO_CONTINUE`:
  - default: `true`
  - if `true`, orchestrator auto-runs until wait conditions
- `AUTO_PICK_TOP1`:
  - default: `true`
  - if `true`, Top-3 selection auto-picks rank 1 unless overridden
- `API_TOKEN_REQUIRED`:
  - default: `false`
  - when `true` in production, `x-api-token` is required for protected APIs
- `SECURITY_HEADERS_STRICT`:
  - default: `true`
  - applies strict security headers via `middleware.ts`
- `ENABLE_AGENT_CHAT_CONTROL`:
  - default: `true`
  - enables chat-to-action control path (`/api/chat`)
- `OPENAI_FALLBACK_MODE`:
  - default: `deterministic_mock`
  - valid: `deterministic_mock|none`
  - when OpenAI call fails and this is `deterministic_mock`, pipeline continues with mock outputs

### Supabase (required)
- `NEXT_PUBLIC_SUPABASE_URL`:
  - local example: `http://127.0.0.1:54321`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`:
  - required for browser anonymous/web3 auth
- `SUPABASE_SERVICE_ROLE_KEY`:
  - server-only; required for storage/rpc operations
- `API_BEARER_TOKEN`:
  - shared token for API guard (sent as `x-api-token`)
  - required in production when `API_TOKEN_REQUIRED=true`
- `NEXT_PUBLIC_MONAD_CHAIN_ID`:
  - default: `10143`
  - used for client wallet chain guard (Monad only)

### OpenAI
- `OPENAI_API_KEY`:
  - required when actual model calls are enabled
- `OPENAI_MODEL_TEXT`:
  - default: `gpt-4o` (recommended quality profile)
  - lower-cost fallback: `gpt-4.1-mini`
- `OPENAI_MODEL_IMAGE`:
  - default: `gpt-image-1`

### Guardrails
- `INTENT_CLARIFY_THRESHOLD`:
  - default: `4`
  - valid: `1-5`
- `CANDIDATE_COUNT`:
  - default: `20`
- `TOP_K`:
  - default: `3`
- `MAX_REVISIONS`:
  - default: `2`
- `MAX_SELF_HEAL_ATTEMPTS`:
  - default: `3`

### Agent runtime behavior
- Auto-run pause points:
  - `intent_confidence < INTENT_CLARIFY_THRESHOLD`
  - candidate decision step when auto pick is disabled
  - explicit user pause action
- Chat control commands (`/api/chat`):
  - `select_candidate`
  - `revise_constraint`
  - `rerun_candidates`
  - `pause|resume|proceed`
  - `generate_followup_asset`

### Usage limits
- `REQUEST_LIMIT_PER_DAY`:
  - default: `100`
- `IMAGE_LIMIT_PER_DAY`:
  - default: `20`
- `CONCURRENT_JOB_LIMIT`:
  - default: `1`
- `SESSION_RETENTION_DAYS`:
  - default: `30`

### Optional Monad mint
- `ENABLE_MONAD_MINT`:
  - default: `false`
- `MONAD_CHAIN_ID`:
  - default: `10143`
- `MONAD_PUBLIC_RPC_URL`:
  - default: `https://testnet-rpc.monad.xyz`
- `MONAD_EXPLORER_URL`:
  - default: `https://testnet.monadexplorer.com`
- `MONAD_RPC_URL`:
  - optional (keep empty in `.env.example` if private)
- `MONAD_PRIVATE_KEY`:
  - optional (sensitive, keep empty in `.env.example`)

### Logging
- `LOG_LEVEL`:
  - default: `info`
  - valid: `debug|info|warn|error`

### Storage
- `STORAGE_BUCKET_PACKS`:
  - default: `brand-packs`

### Vercel integration (optional/manual + runtime)
- `VERCEL_ENV`:
  - usually auto-provided by Vercel runtime
- `VERCEL_URL`:
  - usually auto-provided by Vercel runtime
- `VERCEL_PROJECT_PRODUCTION_URL`:
  - usually auto-provided by Vercel runtime
- `VERCEL_PROJECT_ID`:
  - optional for Vercel API/CLI integrations
- `VERCEL_ORG_ID`:
  - optional for Vercel API/CLI integrations
- `VERCEL_TOKEN`:
  - optional for Vercel API/CLI integrations (sensitive)

### Supabase console/CLI integration (optional)
- `SUPABASE_ACCESS_TOKEN`:
  - optional for Supabase CLI automation (sensitive)
- `SUPABASE_PROJECT_REF`:
  - optional project identifier
- `SUPABASE_DB_PASSWORD`:
  - optional for DB tooling (sensitive)

### Additional API/console integrations (optional)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN` (sensitive)
- `ALCHEMY_API_KEY`
- `INFURA_API_KEY`
- `ETHERSCAN_API_KEY`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `SENTRY_DSN`
- `SLACK_WEBHOOK_URL` (sensitive)
- `DISCORD_WEBHOOK_URL` (sensitive)
- `OPENROUTER_API_KEY` (sensitive)
- `ANTHROPIC_API_KEY` (sensitive)
- `GOOGLE_API_KEY` (sensitive)

## Vercel setup
- Production branch: `main`
- Preview branch: `develop`
- Add the same environment keys in Vercel Project Settings.
- Never commit real secrets to git.
- In production, set:
  - `API_TOKEN_REQUIRED=true`
  - `SECURITY_HEADERS_STRICT=true`

## Public vs sensitive rule
- Public network values can be committed in `.env.example`.
- Secrets (private keys, provider tokens, bearer secrets) must stay empty in `.env.example`.

## Required Supabase SQL
- Apply migration under:
  - `infra/supabase/migrations/20260219_agent_runtime.sql`
- This migration creates:
  - sessions/messages/jobs/artifacts/packs/preset/usage tables
  - RLS policies
  - active-job concurrency trigger (`jobs`)
