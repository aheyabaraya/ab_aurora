# Operations Runbook (v0.4)

This runbook is the single operational guide for release/push, Supabase SQL, environment values, Vercel settings, security hardening checks, and smoke tests.

## 1) Git release flow

### Branch policy
- Production branch: `main`
- Preview branch: `develop`

### Commands
```bash
cd /Users/yuminseog/ab_aurora
git status --short
git add .
git commit -m "feat: ship stage-based agent runtime with ops runbook and security hardening"
git push origin develop
```

## 2) Supabase SQL (manual via SQL Editor)

### 2.1 Fresh/Dev reset SQL
```sql
drop table if exists public.usage cascade;
drop table if exists public.preset cascade;
drop table if exists public.packs cascade;
drop table if exists public.artifacts cascade;
drop table if exists public.jobs cascade;
drop table if exists public.messages cascade;
drop table if exists public.sessions cascade;
```

### 2.2 Apply migration
- Open Supabase Dashboard -> SQL Editor
- Paste and run:
  - `infra/supabase/migrations/20260219_agent_runtime.sql`

### 2.3 Verify SQL
```sql
select tablename
from pg_tables
where schemaname='public'
  and tablename in ('sessions','messages','jobs','artifacts','packs','preset','usage')
order by tablename;

select proname
from pg_proc
where proname='block_multiple_active_jobs';
```

## 3) Environment variables

## 3.1 Local `.env.local`
```bash
NODE_ENV=development
APP_URL=http://localhost:3000
AGENT_UI_MODE=agent_stage
AUTO_CONTINUE=true
AUTO_PICK_TOP1=true
API_TOKEN_REQUIRED=false
SECURITY_HEADERS_STRICT=true
ENABLE_AGENT_CHAT_CONTROL=true
OPENAI_FALLBACK_MODE=deterministic_mock

NEXT_PUBLIC_SUPABASE_URL=<supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>

OPENAI_API_KEY=<optional>
OPENAI_MODEL_TEXT=gpt-4o
OPENAI_MODEL_IMAGE=gpt-image-1

API_BEARER_TOKEN=<random-strong-token>
INTENT_CLARIFY_THRESHOLD=4
CANDIDATE_COUNT=20
TOP_K=3
MAX_REVISIONS=2
MAX_SELF_HEAL_ATTEMPTS=3
CONCURRENT_JOB_LIMIT=1
SESSION_RETENTION_DAYS=30

ENABLE_MONAD_MINT=false
NEXT_PUBLIC_MONAD_CHAIN_ID=10143
MONAD_CHAIN_ID=10143
MONAD_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_EXPLORER_URL=https://testnet.monadexplorer.com
MONAD_RPC_URL=
MONAD_PRIVATE_KEY=
```

## 3.2 Vercel Environment Variables

### Project Settings path
- Vercel -> Project -> `Settings` -> `Environment Variables`

### Required scope
- Add values for all three scopes:
  - `Development`
  - `Preview`
  - `Production`

### Production hardened values
- `API_TOKEN_REQUIRED=true`
- `SECURITY_HEADERS_STRICT=true`
- `OPENAI_FALLBACK_MODE=deterministic_mock` (switch to `none` after stability)

### Secret handling rules
- Never expose these with `NEXT_PUBLIC_` prefix:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `API_BEARER_TOKEN`
  - `OPENAI_API_KEY`
  - `MONAD_PRIVATE_KEY`

### Build/deploy settings
- Production Branch: `main`
- Preview Branch: `develop`

## 4) Security hardening checklist

- `API_TOKEN_REQUIRED` gate is active in production.
- `x-api-token` check uses timing-safe comparison.
- API errors return `request_id` and hide internal details.
- Logs redact sensitive keys (token/secret/password/api_key/authorization).
- Security headers are enabled via middleware:
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Content-Security-Policy`
  - `Strict-Transport-Security` (production only)

## 5) Cleanup before release
```bash
rm -rf .next .tmp-tests
git status --short
```

## 6) Validation commands
```bash
pnpm lint
pnpm typecheck
pnpm test:agent
pnpm build
```

## 7) Local API smoke test

### 7.1 Start server
```bash
pnpm dev
```

### 7.2 Create session
```bash
curl -sS -X POST http://localhost:3000/api/session/start \
  -H 'content-type: application/json' \
  -d '{
    "mode":"mode_b",
    "product":"AI landing page builder for solo founders",
    "audience":"Early-stage builders shipping in public",
    "style_keywords":["bold","editorial","futuristic"],
    "auto_continue":true,
    "auto_pick_top1":true
  }'
```

### 7.3 Run pipeline
```bash
curl -sS -X POST http://localhost:3000/api/agent/run-step \
  -H 'content-type: application/json' \
  -d '{
    "session_id":"<SESSION_ID>",
    "idempotency_key":"smoke-run-001"
  }'
```

### 7.4 Chat override
```bash
curl -sS -X POST http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{
    "session_id":"<SESSION_ID>",
    "message":"2번 후보로 바꿔"
  }'
```

### 7.5 Verify session + jobs
```bash
curl -sS "http://localhost:3000/api/sessions/<SESSION_ID>"
curl -sS "http://localhost:3000/api/jobs?session_id=<SESSION_ID>"
```

### 7.6 Optional mint check
```bash
curl -sS -X POST http://localhost:3000/api/mint \
  -H 'content-type: application/json' \
  -d '{"pack_id":"<PACK_ID>"}'
```
- Expect `{"status":"disabled"}` when `ENABLE_MONAD_MINT=false`.

## 8) Incident quick checks

- `401 Unauthorized` in production:
  - verify `API_TOKEN_REQUIRED=true`
  - check `x-api-token` header value
- empty Top-3:
  - verify `CANDIDATE_COUNT >= 3`
  - verify `OPENAI_FALLBACK_MODE=deterministic_mock`
- session stuck:
  - verify `CONCURRENT_JOB_LIMIT`
  - check `/api/jobs?session_id=<SESSION_ID>`
