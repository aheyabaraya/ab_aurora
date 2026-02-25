# Test Plan (v0.5 Runtime Vertical Slice)

Goal: verify runtime-first loop behavior without breaking existing stage APIs.

---

## 1) Unit tests (`tests/unit/*`)

- `planner`
  - selects action in priority order: top3 -> selection -> outputs -> package
  - returns no action when goal already satisfied
- `policy`
  - denies when active job limit reached
  - returns confirm-required for high-cost actions
- `evaluator`
  - pass/fail threshold with `RUNTIME_EVAL_MIN_SCORE`
  - `next_hint` correctness
- `memory`
  - session memory upsert/read
  - brand memory merge when `RUNTIME_MEMORY_PERSIST=true`

---

## 2) API tests (`tests/api/*`)

- `POST /api/runtime/start`
  - happy path
  - idempotency replay
- `POST /api/runtime/step`
  - action execution
  - idempotent replay
- `GET /api/runtime/goals/:goalId`
  - trace integrity (`plans/actions/evals/memories/events/tool_calls`)
- backward compatibility
  - `/api/agent/run-step` returns legacy shape + optional `runtime_meta`
  - `/api/chat` returns legacy shape + optional `runtime_meta`
- seed matrix (`tests/api/session-seed-matrix.test.cjs`)
  - `POST /api/dev/seed/session` preset 생성 검증 (`fresh/top3_ready/selected_ready/build_confirm_required/package_ready/done`)
  - dev seed auth/guard 검증 (`401/404/403`)
  - invalid `session_id` / `goal_id` on session-dependent APIs -> `404`
  - missing `session_id` query -> `400`
  - `/api/jobs?session_id=...` nonexistent session policy -> `404`
  - `GET /api/sessions/:id` `recent_messages` 존재 + 최신순 정렬 검증

---

## 3) Integration tests (`tests/integration/*`)

- full session progression to `done`
- Top-3 generation + selected candidate persistence
- output artifact generation (`tokens/social_assets/code_plan/validation`)
- packaging artifact existence (`pack_meta`)
- fallback behavior when OpenAI call is unavailable
- per-session active job constraint enforcement

---

## 4) Storage seed contract tests

- file contract (`tests/unit/storage-file-seed.contract.test.cjs`)
  - seed 생성 후 repository 재생성(프로세스 재로드 유사)에서도 session/artifact 유지
  - seeded session으로 추가 step 진행 가능
- supabase contract (`tests/unit/storage-supabase-seed.contract.test.cjs`, opt-in)
  - 실행 조건: `SEED_TEST_SUPABASE=true` + 실제 Supabase service env 존재
  - seed 생성 후 chat/revise/run-step 스타일 왕복 검증

---

## 5) Smoke tests (local + preview)

- Start session -> runtime goal -> runtime step loop -> completed
- Chat override (`select_candidate`) applied and reflected
- Runtime tables populated and queryable
- Mint endpoint disabled behavior verified when mint flag off

Behavior-test conservative profile:
- `RUNTIME_ENABLED=false`
- `AUTO_CONTINUE=false`
- `CANDIDATE_COUNT=3`
- `TOP_K=3`
- `MAX_REVISIONS=0`
- Verify single-step progression with manual `Run / Continue`

---

## 6) Quality gates

Run in order:
```bash
pnpm lint
pnpm typecheck
pnpm test:agent
pnpm build
```

Seed-focused suites:
```bash
pnpm test:api:seed
pnpm test:storage:file:contract
pnpm test:storage:supabase:contract   # opt-in
```

All gates must pass before promote to preview/main.

---

## 7) Failure/recovery checks

- runtime max-iteration safety stop
- replan limit exceeded -> goal failed
- runtime tool timeout (`RUNTIME_TOOL_TIMEOUT_MS`) -> failed action then replan/fail path
- invalid action override -> safe error path
- runtime disable rollback (`RUNTIME_ENABLED=false`) keeps legacy flow working
- repeated `Regenerate Top-3` / revise actions should be manually bounded during real-key tests
