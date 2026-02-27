# Operations Runbook (v0.6)

This is the operational source of truth for:
- plan conformance checks
- Supabase/Vercel console operations
- env configuration matrix
- smoke tests
- release commit/push flow

---

## 0) Plan Conformance Check (Runtime-First Vertical Slice)

Use this section to verify the planned runtime slice is actually in code.

### 0.1 Feature checklist
| Area | Planned | Implemented | Check path |
|---|---|---|---|
| Runtime modules (`planner/policy/evaluator/memory/trace/runner`) | Yes | Yes | `lib/runtime/*` |
| Runtime APIs (`start/step/goals`) | Yes | Yes | `app/api/runtime/*` |
| Legacy facade compatibility (`/api/agent/run-step`, `/api/chat`, `/api/revise`) | Yes | Yes (additive `runtime_meta`) | `app/api/agent/run-step/route.ts`, `app/api/chat/route.ts`, `app/api/revise/route.ts` |
| Runtime DB control-plane tables | Yes | Yes | `infra/supabase/migrations/20260220_runtime_control_plane.sql` |
| Runtime limits (`max_iterations`, `replan_limit`, `tool_timeout`) | Yes | Yes | `lib/env.ts`, `lib/runtime/runner.ts` |
| Top-3 flow + pack completion evaluator | Yes | Yes | `lib/runtime/planner.ts`, `lib/runtime/evaluator.ts` |
| UI runtime control panel | Yes | Yes | `app/page.tsx` |
| Unit/API/integration coverage | Yes | Yes | `tests/unit/runtime-core.test.cjs`, `tests/api/runtime-routes.test.cjs`, `tests/integration/*` |

### 0.2 Required verification commands
```bash
cd /Users/yuminseog/ab_aurora
pnpm lint
pnpm typecheck
pnpm test:agent
pnpm build
```

---

## 1) Local Preflight

1. Confirm branch and diff:
```bash
git status --short --branch
```
2. Ensure `.env.local` exists and required keys are present.
3. Ensure no accidental secrets are staged:
```bash
git diff --name-only --cached | rg -n "\.env|key|secret|token" || true
```

---

## 2) Supabase Console Operations (Detailed)

## 2.1 Open SQL Editor
1. Open `https://supabase.com/dashboard`.
2. Select your AB_Aurora project.
3. Left menu -> `SQL Editor`.
4. Click `New query`.

## 2.2 Optional fresh/dev reset
Paste and run:
```sql
drop table if exists public.runtime_events cascade;
drop table if exists public.runtime_memories cascade;
drop table if exists public.runtime_evals cascade;
drop table if exists public.runtime_tool_calls cascade;
drop table if exists public.runtime_actions cascade;
drop table if exists public.runtime_plans cascade;
drop table if exists public.runtime_goals cascade;

drop table if exists public.usage cascade;
drop table if exists public.preset cascade;
drop table if exists public.packs cascade;
drop table if exists public.artifacts cascade;
drop table if exists public.jobs cascade;
drop table if exists public.messages cascade;
drop table if exists public.sessions cascade;
```

## 2.3 Apply migrations in order
1. Paste and execute `infra/supabase/migrations/20260219_agent_runtime.sql`.
2. Paste and execute `infra/supabase/migrations/20260220_runtime_control_plane.sql`.

## 2.4 Verify schema
Run:
```sql
select tablename
from pg_tables
where schemaname='public'
  and tablename in (
    'sessions','messages','jobs','artifacts','packs','preset','usage',
    'runtime_goals','runtime_plans','runtime_actions','runtime_tool_calls',
    'runtime_evals','runtime_memories','runtime_events'
  )
order by tablename;
```

Run:
```sql
select indexname
from pg_indexes
where schemaname='public'
  and tablename in ('runtime_goals','runtime_actions','runtime_memories')
order by tablename, indexname;
```

Run (RLS enabled check):
```sql
select tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename like 'runtime_%'
order by tablename;
```

---

## 3) Environment Variable Matrix

## 3.1 Local `.env.local` recommended baseline
```bash
NODE_ENV=development
APP_URL=http://localhost:3000
# Optional legacy bridge only: chat_flat -> guided, agent_stage -> pro
# AGENT_UI_MODE=chat_flat

AUTO_CONTINUE=false
AUTO_PICK_TOP1=true
ENABLE_AGENT_CHAT_CONTROL=true
OPENAI_FALLBACK_MODE=deterministic_mock

RUNTIME_ENABLED=false
RUNTIME_MAX_ITERATIONS=12
RUNTIME_REPLAN_LIMIT=2
RUNTIME_TOOL_TIMEOUT_MS=30000
RUNTIME_MEMORY_PERSIST=true
RUNTIME_EVAL_MIN_SCORE=0.8

INTENT_CLARIFY_THRESHOLD=4
CANDIDATE_COUNT=3
TOP_K=3
MAX_REVISIONS=0
MAX_SELF_HEAL_ATTEMPTS=3
CONCURRENT_JOB_LIMIT=1

NEXT_PUBLIC_SUPABASE_URL=<supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>

API_BEARER_TOKEN=<strong-random-token>
API_TOKEN_REQUIRED=false
SECURITY_HEADERS_STRICT=true

OPENAI_API_KEY=<optional>
OPENAI_MODEL_TEXT=gpt-4o
OPENAI_MODEL_IMAGE=gpt-image-1

ENABLE_MONAD_MINT=false
NEXT_PUBLIC_MONAD_CHAIN_ID=10143
MONAD_CHAIN_ID=10143
MONAD_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_EXPLORER_URL=https://testnet.monadexplorer.com
MONAD_RPC_URL=
MONAD_PRIVATE_KEY=
```

## 3.2 Vercel console setup (Detailed)
1. Open Vercel dashboard and choose project.
2. `Settings -> Git`:
   - Production Branch: `main`
3. `Settings -> Environment Variables`.
4. For each key, set `Environment` to:
   - `Development`
   - `Preview`
   - `Production`
5. Save all vars and trigger redeploy.

### Suggested per-environment values
| Key | Development | Preview (`develop`) | Production (`main`) |
|---|---|---|---|
| `RUNTIME_ENABLED` | `true` | `true` | phase1:`false`, phase2:`true` |
| `AUTH_V2_ENABLED` | `true` | `true` | `true` |
| `API_TOKEN_REQUIRED` | `false` | `false` | `true` (internal/dev routes only) |
| `SECURITY_HEADERS_STRICT` | `true` | `true` | `true` |
| `OPENAI_FALLBACK_MODE` | `deterministic_mock` | `deterministic_mock` | `deterministic_mock` then `none` after stability |

### Never expose as `NEXT_PUBLIC_*`
- `SUPABASE_SERVICE_ROLE_KEY`
- `API_BEARER_TOKEN`
- `OPENAI_API_KEY`
- `MONAD_PRIVATE_KEY`

---

## 4) Security Hardening Verification

Checklist:
- `AUTH_V2_ENABLED=true` in production.
- user APIs require `Authorization: Bearer <supabase access token>`.
- internal/dev routes can still enforce `x-api-token` (`lib/auth/api-token.ts`).
- Error responses include `request_id` and hide internals.
- Sensitive fields are redacted in logs.
- Security headers present in responses:
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Content-Security-Policy`
  - `Strict-Transport-Security` (production)

Quick check:
```bash
curl -I https://<your-domain>
```

---

## 5) Smoke Test (Onboarding + Bearer Auth)

## 5.1 Start app / set base URL
```bash
pnpm dev
export BASE_URL="http://localhost:3000"
set -a; source .env.local; set +a
# deployed example
# export BASE_URL="https://ab-aurora.vercel.app"
```

## 5.2 Browser onboarding flow
1. Open `${BASE_URL}/onboarding`.
2. Click `Start Onboarding`.
3. Confirm redirect to `/onboarding/callback?code=...&state=...`.
4. Click `Exchange Code`.
5. Confirm redirect to `/` and workspace loads.

## 5.3 401 check (missing auth)
```bash
curl -i -sS -X POST "${BASE_URL}/api/session/start" \
  -H 'content-type: application/json' \
  -d '{
    "mode":"mode_b",
    "product":"AI landing page builder",
    "audience":"solo founders",
    "style_keywords":["bold","editorial","futuristic"],
    "auto_continue":true,
    "auto_pick_top1":true
  }' | head -n 1
```
Expected: `HTTP/1.1 401`.

## 5.4 403 check (authenticated but not entitled)
```bash
export ACCESS_TOKEN_NO_ENTITLE=$(node -e '(async()=>{const {createClient}=require("@supabase/supabase-js");const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);const {data,error}=await s.auth.signInAnonymously();if(error||!data.session?.access_token){throw new Error(error?.message||"missing token");}process.stdout.write(data.session.access_token);})().catch((e)=>{console.error(e.message);process.exit(1);});')

curl -i -sS -X POST "${BASE_URL}/api/session/start" \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer ${ACCESS_TOKEN_NO_ENTITLE}" \
  -d '{
    "mode":"mode_b",
    "product":"AI landing page builder",
    "audience":"solo founders",
    "style_keywords":["bold","editorial","futuristic"],
    "auto_continue":true,
    "auto_pick_top1":true
  }' | head -n 1
```
Expected: `HTTP/1.1 403`.

## 5.5 200 check after onboarding
Use an onboarded browser token as `ACCESS_TOKEN_ONBOARDED` (same user that completed `/onboarding`):
```bash
export ACCESS_TOKEN_ONBOARDED="<supabase-access-token>"

curl -sS -X GET "${BASE_URL}/api/auth/me" \
  -H "Authorization: Bearer ${ACCESS_TOKEN_ONBOARDED}"
```
Expected: `onboarding_complete=true`, `aurora.access` active.

## 5.6 Start session / runtime / chat with bearer
```bash
curl -sS -X POST "${BASE_URL}/api/session/start" \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer ${ACCESS_TOKEN_ONBOARDED}" \
  -d '{
    "mode":"mode_b",
    "product":"AI landing page builder",
    "audience":"solo founders",
    "style_keywords":["bold","editorial","futuristic"],
    "auto_continue":true,
    "auto_pick_top1":true
  }'
```
Expected keys: `session_id`, `current_step`, `config`.

## 5.7 404 ownership check
1. Create session with onboarded user A token.
2. Request `/api/sessions/<SESSION_ID_FROM_A>` with onboarded user B token.
3. Expected: `404 Resource not found`.

## 5.8 owner_user_id write check
```sql
select count(*) as null_owner_sessions
from public.sessions
where owner_user_id is null;
```
Expected: no 신규 증가 (`0` target after cleanup/validate).

---

## 6) Rollout Sequence

1. `develop` canary:
   - `RUNTIME_ENABLED=true`
   - run full validation + smoke
2. `main` phase 1:
   - deploy with `RUNTIME_ENABLED=false`
   - smoke legacy facade
3. `main` phase 2:
   - set `RUNTIME_ENABLED=true`
   - rerun smoke, monitor runtime traces

Rollback:
- flip `RUNTIME_ENABLED=false` immediately.

---

## 7) Commit and Push

```bash
cd /Users/yuminseog/ab_aurora
rm -rf .next .tmp-tests
git status --short

git add .
git commit -m "feat: ship runtime-first agent vertical slice"
git push origin develop
```

---

## 8) Post-Deploy Monitoring

1. `/api/onboarding/exchange` `400` count and `error_code` distribution.
2. status ratio trend for user APIs: `401`, `403`, `404`.
3. `owner_user_id is null` 신규 발생 여부:
```sql
select date_trunc('hour', created_at) as hour, count(*) as null_owner_count
from public.sessions
where owner_user_id is null
group by 1
order by 1 desc;
```
