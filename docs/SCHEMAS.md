# docs/SCHEMAS.md — AB_Aurora Schemas (v0.6)

Goal: define stable schemas for stage outputs and runtime control-plane records.

---

## 0) Pipeline Enums

### `AgentStep`
`interview_collect | intent_gate | spec_draft | brand_narrative | candidates_generate | top3_select | approve_build | package | done`

### `ArtifactKind` (core)
`interview | clarify_questions | brand_spec_draft | brand_narrative | candidates_top3 | selection | tokens | social_assets | code_plan | validation | pack_meta`

---

## 1) BrandSpec

### `BrandSpecDraft`
- `stage`: `draft`
- Required:
  - `version`, `mode`
  - `intent.has_direction`
  - `intent.intent_confidence` (`1..5`)
  - `intent.variation_width` (`wide|medium|narrow`)
  - `input`
  - `scoring` (`candidate_count`, `top_k`)
- Optional during draft:
  - `persona`, `naming`, `moodboard`, `ui_plan`, `tokens`, `social_assets`, `code_plan`
  - `direction`

### `BrandSpecFinal`
- `stage`: `final`
- Required:
  - `selected_candidate_id`
  - finalized `moodboard`, `ui_plan`, `tokens`, `social_assets`, `code_plan`
  - Top-3 snapshot (`candidates[]`, `scores`, `rank`)

---

## 2) Stage Runtime Entities

### `Session`
- `id`, `mode`, `product`, `audience`, `style_keywords`
- `current_step`, `status`
- `auto_continue`, `auto_pick_top1`, `paused`
- `intent_confidence`, `variation_width`
- `latest_top3`, `selected_candidate_id`
- `draft_spec`, `final_spec`, `revision_count`

### `BrandDirection`
- `brief_summary`
- `brand_promise`
- `audience_tension`
- `narrative_summary`
- `voice_principles[]`
- `anti_goals[]`
- `visual_principles[]`
- `image_intent`
- `prompt_seed`
- `hero_subject`
- `people_directive`
- `next_question`
- `asset_intent`
  - `focus`
  - `rationale`
  - `priority_order[]`
  - `default_bundle`
  - `defaults_applied`
  - `question`
- `clarity`
  - `score`
  - `ready_for_concepts`
  - `summary`
  - `missing_inputs[]`
  - `followup_questions[]`

Contract:
- `BrandDirection` is synthesized during `brand_narrative`
- `clarity.ready_for_concepts` is the semantic gate for moving from `DEFINE` to `EXPLORE`
- later image/render prompts should derive from `BrandDirection`, especially:
  - `image_intent`
  - `prompt_seed`
  - `hero_subject`
  - `people_directive`
  - `asset_intent`

### `Job`
- `id`, `session_id`, `step`, `status`
- `payload`, `logs`, `error`, `created_at`

### `Artifact`
- `id`, `session_id`, `job_id`
- `step`, `kind`, `title`, `content`
- provenance: `hash`, `created_at`

### `ChatAction`
- `type`:
  - `revise_constraint`
  - `rerun_candidates`
  - `select_candidate`
  - `proceed`
  - `pause`
  - `resume`
  - `generate_followup_asset`
- `payload`, `raw`

---

## 3) Runtime Control-Plane Entities

### `RuntimeGoal`
- `id`, `session_id`, `goal_type` (`deliver_demo_pack`)
- `goal_input`, `status`
- `current_plan_id`, `current_step_no`
- `last_action_id`, `last_eval_id`
- `idempotency_key`, `error`, `created_at`, `updated_at`

### `RuntimePlan`
- `id`, `goal_id`, `version`
- `rationale`, `proposed_actions[]`, `stop_condition`, `status`
- `created_at`, `updated_at`

### `RuntimeAction`
- `id`, `goal_id`, `plan_id`, `step_no`
- `action_type`, `tool_name`, `action_input`
- `policy_result` (`allow|deny|confirm_required`)
- `status` (`pending|running|completed|failed|denied|confirm_required`)
- `idempotency_key`, `output`, `error`, `finished_at`, `created_at`, `updated_at`

### `RuntimeToolCall`
- `id`, `goal_id`, `action_id`, `tool_name`
- `input`, `output`, `status`, `latency_ms`, `error`, `created_at`

### `RuntimeEval`
- `id`, `goal_id`, `plan_id`, `action_id`
- `scores` (`top3|selection|outputs|package|done|goal_fit`)
- `pass`, `reasons[]`, `next_hint`, `created_at`

### `RuntimeMemory`
- `id`, `scope` (`session|brand`)
- `session_id`, `brand_key`
- `memory_key`, `memory_value`, `weight`, `source_action_id`
- `created_at`, `updated_at`

### `RuntimeEvent`
- `id`, `session_id`, `goal_id`, `event_type`, `payload`, `created_at`

---

## 4) API Payload Contracts

### `POST /api/session/start`
Input:
```json
{
  "mode": "mode_a",
  "product": "string",
  "audience": "string",
  "style_keywords": ["string"],
  "q0_intent_confidence": 4,
  "auto_continue": true,
  "auto_pick_top1": true
}
```
Notes:
- `q0_intent_confidence` is optional for API compatibility, range `1..5`.
- Guided UI always sends `q0_intent_confidence`.
- If omitted, backend falls back to heuristic intent scoring in `interview_collect`.

### `POST /api/runtime/start`
Input:
```json
{
  "session_id": "uuid",
  "goal_type": "deliver_demo_pack",
  "goal_input": {},
  "idempotency_key": "string"
}
```
Output:
```json
{
  "goal_id": "uuid",
  "status": "running",
  "initial_plan": {},
  "current_action": {},
  "request_id": "string"
}
```

### `POST /api/runtime/step`
Input:
```json
{
  "goal_id": "uuid",
  "force_replan": false,
  "action_override": {
    "action_type": "select_candidate",
    "payload": {"candidate_id": "..."}
  },
  "idempotency_key": "string"
}
```
Output:
```json
{
  "goal_status": "running",
  "current_step_no": 1,
  "last_action": {},
  "eval": {},
  "next_action": {},
  "wait_user": false,
  "message": "Runtime step completed.",
  "request_id": "string"
}
```

### `GET /api/runtime/goals/:goalId`
Output:
```json
{
  "goal": {},
  "plans": [],
  "actions": [],
  "evals": [],
  "memories": [],
  "events": [],
  "tool_calls": [],
  "request_id": "string"
}
```

### Backward-compatible additive field
`/api/agent/run-step`, `/api/chat`, `/api/revise` responses may include:
```json
{
  "runtime_meta": {
    "enabled": true,
    "goal_id": "uuid",
    "goal_status": "running",
    "current_step_no": 1,
    "eval": {}
  }
}
```

---

## 5) Top-3 Candidate Schema

- `id`
- `rank`
- `score`
- `naming`
- `moodboard`
- `ui_plan`
- `rationale`

`selected_candidate_id` must reference one of `latest_top3[].id`.

---

## 6) Brand Narrative Artifact Schema

Artifact `kind = "brand_narrative"`:
- `direction` (`BrandDirection`)
- `source` (`openai | mock`)
- optional `revision_note`

Operational note:
- the artifact is no longer just a short narrative summary
- it stores the active structured direction that later stages reuse directly

---

## 7) TokenURI Metadata (optional mint)

Messaging rule: use provenance/origin language, not legal ownership claims.

Required properties:
- `bundle_hash`
- `bundle_uri` (CID if present)
- `spec_version`
- `models`
- `created_at`
