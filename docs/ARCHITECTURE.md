# docs/ARCHITECTURE.md — AB_Aurora Architecture (v0.6)

## High-level
Client (Next.js Agent UI)
-> API Facade (`/api/agent/run-step`, `/api/chat`, `/api/revise`)
-> Runtime Control Plane (`observe -> plan -> policy -> act -> evaluate -> memory`)
-> Tool Backends (current stage orchestrator)
-> Validation (`eslint`, `tsc`) + Packager (hash/CID)
-> Optional Monad mint (`/api/mint`)

This release is a runtime-first vertical slice: runtime is the top control loop, while the existing stage orchestrator remains the execution backend.

Onboarding UX contract:
- Pre-session renders as a centered single-card setup surface.
- Workspace (canvas + chat dock) appears only after successful session start transition.

---

## Planes

### Control plane (`lib/runtime/*`)
- `runner`: goal lifecycle, loop execution, idempotency, stop conditions
- `planner`: rule-first next action planning
- `policy`: action allow/deny/confirm gate
- `tool-registry`: runtime tools mapped to orchestrator steps
- `evaluator`: goal fitness scoring and next hint
- `memory`: session/brand memory read-write
- `trace`: structured runtime events

### Execution plane (`lib/agent/*` + `lib/storage/*`)
- Existing stage state machine:
  - `interview_collect -> intent_gate -> spec_draft -> brand_narrative -> candidates_generate -> top3_select -> approve_build -> package -> done`
- `brand_narrative` is deterministic in v1 and persists a dedicated narrative artifact before candidate generation.
- Artifact persistence (session/job/artifact/pack)
- Candidate generation/scoring and Top-3 selection
- Build outputs + packaging + optional mint

---

## Runtime Loop Contract

Each runtime step executes this closed loop:
1. `observe`: read session/jobs/artifacts/memories
2. `plan`: choose next action (`RuntimeActionSpec`)
3. `policy`: `allow | deny | confirm_required`
4. `act`: run tool (`tool.*`)
5. `evaluate`: score progress and decide pass/wait/replan
6. `memory`: write session and optional brand memory

### Hard limits
- `RUNTIME_MAX_ITERATIONS` (default `12`)
- `RUNTIME_REPLAN_LIMIT` (default `2`)
- `RUNTIME_TOOL_TIMEOUT_MS` (default `30000`)
- `CONCURRENT_JOB_LIMIT` (default `1`)
- Goal success condition:
  - `session.current_step == done`
  - `pack_meta` artifact exists
  - Top-3/selection/outputs criteria pass evaluator

### Wait-user conditions
- Policy deny/confirm-required
- `intent_confidence < INTENT_CLARIFY_THRESHOLD`
- Invalid/ambiguous override action
- Max-iteration safety stop reached

---

## Tool Mapping (Vertical Slice)

- `tool.session.observe`
  - Reads session/jobs/artifacts snapshot.
- `tool.brand.ensure_top3`
  - Progresses pipeline to Top-3.
  - Fails if Top-3 is still unavailable.
- `tool.brand.ensure_selection`
  - Applies auto top1 or user override.
  - Ensures `selected_candidate_id`.
- `tool.brand.ensure_outputs`
  - Ensures `tokens`, `social_assets`, `code_plan`, `validation` artifacts.
- `tool.brand.ensure_package`
  - Ensures package creation and `pack_meta` artifact.
- `tool.chat.apply_override`
  - Applies chat-derived structured action via orchestrator path.

---

## API Facade Behavior

### New runtime endpoints
- `POST /api/runtime/start`
- `POST /api/runtime/step`
- `GET /api/runtime/goals/:goalId`

### Backward-compatible endpoints
- `POST /api/agent/run-step`
- `POST /api/chat`
- `POST /api/revise`

When `RUNTIME_ENABLED=true`, legacy endpoints execute through runtime and return additive `runtime_meta`. When disabled, they use orchestrator-only behavior.

---

## Data Layer

### Core runtime tables
- `sessions`, `messages`, `jobs`, `artifacts`, `packs`, `preset`, `usage`

### Runtime control-plane tables
- `runtime_goals`
- `runtime_plans`
- `runtime_actions`
- `runtime_tool_calls`
- `runtime_evals`
- `runtime_memories`
- `runtime_events`

All runtime tables use RLS deny-by-default and service-role access path.

---

## Deployment Strategy

- `develop`: runtime canary (`RUNTIME_ENABLED=true`)
- `main`: phased enablement
  - phase 1: `RUNTIME_ENABLED=false`
  - phase 2: `RUNTIME_ENABLED=true` after smoke checks
- Instant rollback path: set `RUNTIME_ENABLED=false`.

---

## Prompting Decision Note

- Near-term priority: finish the current AB Aurora flow first with the existing direct OpenAI integration path.
- Do not introduce Vercel AI Gateway or broader model-routing changes until the current user flow is stable end-to-end.
- After the current flow is complete, add OpenAI prompt/dashboard integration to improve prompt consistency, structure, and output polish.
- Target direction for that follow-up:
  - keep one primary text model for direction/refinement/candidate planning to preserve stylistic consistency
  - keep image generation separate
  - move prompt definitions into reusable prompt assets so system guidance and stage-specific prompt inputs are centrally managed
