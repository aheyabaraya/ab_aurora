# AB_Aurora (ab_aurora) — Internal Spec (v0.6)

Purpose: lock product behavior so implementation and demo operations are deterministic.

---

## 0) Product Definition

AB_Aurora is a Brand Persona Director Agent for builders with a concrete product idea who need coherent branding and UI direction.

Core output track:
1. persona/story
2. naming
3. moodboard
4. UI plan
5. tokens
6. social assets
7. code plan/output
8. validation
9. package provenance

Top-3 candidate quality is the central outcome for early decision quality.

---

## 1) Modes

- Mode A: reference-driven
- Mode B: guided blank

Reference quality must raise intent confidence before lock-in.

### Onboarding Surface
- Pre-session uses a centered single-card layout.
- Right-side chat panel is hidden until session start succeeds.
- On successful start, UI transitions with a short flip animation into the 2-column workspace.

---

## 2) Confidence and Variation

- `intent_confidence`: `1..5`
- `variation_width` mapping:
  - `1..2 -> wide`
  - `3 -> medium`
  - `4..5 -> narrow`
- Guided UI requires Q0 (`1..5`) and sends it as `q0_intent_confidence` at session start.
- If `q0_intent_confidence` exists, it is the source of truth for initial `intent_confidence` and `variation_width`.
- If Q0 is missing (legacy clients), `interview_collect` computes score via heuristic fallback.

Intent gate rule:
- `intent_gate` is no longer the primary semantic block.
- Q0 / heuristic confidence still sets initial `variation_width`.
- semantic readiness for concept generation is decided by AI inside `direction.clarity.ready_for_concepts`.

---

## 3) Stage State Machine (Execution Backend)

`interview_collect -> intent_gate -> spec_draft -> brand_narrative -> candidates_generate -> top3_select -> approve_build -> package -> done`

Policies:
- `auto_continue=true`: automatically progress until a wait condition
- `auto_pick_top1=true`: auto select rank-1 candidate unless overridden
- revisions: max 2
- self-heal: max 3
- per-session concurrent active jobs: `CONCURRENT_JOB_LIMIT`
- `brand_narrative` synthesizes a structured `BrandDirection` from the brief.
- `BrandDirection` becomes the source of truth for all later prompts and bundle generation.

Every step persists at least one artifact for observability and follow-up actions.

### DEFINE semantics
- `interview_collect`
  - capture and normalize user brief input
- `intent_gate`
  - lightweight transition step
  - preserves/derives `intent_confidence` and `variation_width`
  - does not perform the primary semantic veto
- `spec_draft`
  - writes the draft spec shell
- `brand_narrative`
  - calls direction synthesis
  - stores:
    - `image_intent`
    - `prompt_seed`
    - `hero_subject`
    - `people_directive`
    - `asset_intent`
    - `clarity`
  - if `clarity.ready_for_concepts=false`, Aurora asks follow-up questions and waits in `DEFINE`
  - if `clarity.ready_for_concepts=true`, Aurora can move to `EXPLORE`

---

## 4) Runtime-First Control Loop (Upper Agent Runtime)

The demo runs a closed-loop runtime above the stage machine:

`observe -> plan -> policy -> act -> evaluate -> memory`

### Observe
- session state, jobs, artifacts
- runtime memories (session + optional brand scope)

### Plan
- rule-first planner chooses next missing objective:
  - ensure_top3
  - ensure_selection
  - ensure_outputs
  - ensure_package

### Policy
- decision: `allow|deny|confirm_required`
- deny when active job slot unavailable
- confirm-required for high-cost actions

### Act
- execute `tool.*` mapped to orchestrator-safe step calls
- chat input never executes directly; it becomes structured override action

### Evaluate
- score dimensions: `top3`, `selection`, `outputs`, `package`, `done`, `goal_fit`
- `pass` requires all readiness flags and `goal_fit >= RUNTIME_EVAL_MIN_SCORE`

### Memory
- write `last_action`, `last_eval`, `selected_candidate`
- optional cross-session brand memory keyed by `brand_key = sha256(product + audience)`

### Runtime limits
- `RUNTIME_MAX_ITERATIONS` default `12`
- `RUNTIME_REPLAN_LIMIT` default `2`
- `RUNTIME_TOOL_TIMEOUT_MS` default `30000`
- stop success when `done + pack_meta`

---

## 5) Chat Role (Control Channel)

Chat is a control input surface, not a separate execution engine.

Flow:
`user message -> chat action parse -> structured action -> runtime action/tool -> persisted artifact/event`

Direction refinement rule:
- chat revisions during `DEFINE` rewrite the active `BrandDirection`
- chat revisions after selection still route through the active `BrandDirection`
- follow-up image renders must use `selected candidate + active direction`, not a separate fallback house style

Supported control actions:
- `select_candidate`
- `revise_constraint`
- `rerun_candidates`
- `pause`
- `resume`
- `proceed`
- `generate_followup_asset`

---

## 6) Output Bundle

`/brand-pack/`
- `brand.persona.md`
- `naming.md`
- `moodboard/*`
- `ui.plan.md`
- `brand.tokens.json`
- `social/*`
- `code/*`
- `validation.json`
- `meta.json`

`validation.json` includes lint/typecheck/schema/attempt/timing summary.

---

## 7) API Contract Stability

No client-breaking changes in this cycle.

- Existing APIs stay valid.
- Runtime behavior is enabled behind `RUNTIME_ENABLED`.
- Runtime-only APIs are additive:
  - `POST /api/runtime/start`
  - `POST /api/runtime/step`
  - `GET /api/runtime/goals/:goalId`

Legacy responses may include additive `runtime_meta`.

---

## 8) Guardrails

- candidate count default `20`
- top-k `3`
- revisions `2`
- self-heal `3`
- code scope: single page (`/`) for v0
- OpenAI failure policy: deterministic fallback (configurable)
- security baseline: production token gate + strict headers
