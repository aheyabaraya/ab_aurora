# Demo Script (v0.5, Runtime-First)

Goal: prove AB_Aurora runs as a closed-loop runtime agent while delivering Top-3-centered outputs.

---

## 1) Demo setup

- Start app: `pnpm dev`
- Runtime enabled env:
  - `RUNTIME_ENABLED=true`
  - `AUTO_CONTINUE=true`
  - `AUTO_PICK_TOP1=true`
  - `OPENAI_FALLBACK_MODE=deterministic_mock`

---

## 2) Happy-path script

1. Start session (`POST /api/session/start`).
2. Start runtime goal (`POST /api/runtime/start`, `goal_type=deliver_demo_pack`).
3. Execute runtime step (`POST /api/runtime/step`) until goal status is `completed`.
4. Verify Top-3 exists (`latest_top3.length >= 3`).
5. Verify selected candidate exists (`selected_candidate_id`).
6. Verify artifacts include:
   - `tokens`
   - `social_assets`
   - `code_plan`
   - `validation`
   - `pack_meta`
7. Verify `session.current_step == done`.

---

## 3) Chat control scenario

1. Send chat: `2번 후보로 바꿔` (`POST /api/chat`).
2. Verify:
   - `interpreted_action.type = select_candidate`
   - `applied = true`
   - `runtime_meta.enabled = true`
3. Step runtime again and confirm selection reflected in final artifacts.

---

## 4) Replan/failure scenario

1. Trigger invalid override or blocked action.
2. Verify runtime writes:
   - `policy_denied` or `action_failed` event
   - `goal.status = wait_user` or replan progression
3. Resume with valid action and complete goal.

---

## 5) Evidence to capture

- Runtime timeline:
  - `runtime_goals`
  - `runtime_plans`
  - `runtime_actions`
  - `runtime_evals`
  - `runtime_events`
- Top-3 evidence:
  - rank + score + selected candidate
- Artifact evidence:
  - final artifact list including `pack_meta`
- Validation evidence:
  - lint/typecheck status + attempts

---

## 6) Optional mint check

- `POST /api/mint`
- With `ENABLE_MONAD_MINT=false`, expected response includes `status=disabled`.
