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

---

## 3) Integration tests (`tests/integration/*`)

- full session progression to `done`
- Top-3 generation + selected candidate persistence
- output artifact generation (`tokens/social_assets/code_plan/validation`)
- packaging artifact existence (`pack_meta`)
- fallback behavior when OpenAI call is unavailable
- per-session active job constraint enforcement

---

## 4) Smoke tests (local + preview)

- Start session -> runtime goal -> runtime step loop -> completed
- Chat override (`select_candidate`) applied and reflected
- Runtime tables populated and queryable
- Mint endpoint disabled behavior verified when mint flag off

---

## 5) Quality gates

Run in order:
```bash
pnpm lint
pnpm typecheck
pnpm test:agent
pnpm build
```

All gates must pass before promote to preview/main.

---

## 6) Failure/recovery checks

- runtime max-iteration safety stop
- replan limit exceeded -> goal failed
- runtime tool timeout (`RUNTIME_TOOL_TIMEOUT_MS`) -> failed action then replan/fail path
- invalid action override -> safe error path
- runtime disable rollback (`RUNTIME_ENABLED=false`) keeps legacy flow working
