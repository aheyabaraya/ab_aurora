# docs/ARCHITECTURE.md — AB_Aurora Architecture (v0.3)

## High-level
Client (Next.js UI)
→ API (Agent Orchestrator)
→ OpenAI (text/image)
→ Validation Runner (eslint/tsc)
→ Packager (hash/CID)
→ (Optional) Monad Mint (BrandPackNFT)

---

## Planes

### Control plane
- Chat command input
- Intent parser (`chat -> structured action`)
- Pause/resume/override controls

### Execution plane
- `run-step` orchestrator (state machine)
- Job runner
- Artifact store
- Packager/mint adapters

---

## Modules

1) `agent/interview`
- Mode A/B input collection
- Includes intent confidence score (1–5)
- Produces InterviewResult (source of BrandSpec.input)

2) `agent/intent_confidence`
- Uses:
  - explicit user score (1–5)
  - language cues (“must”, “exactly”, “keep this”), reference clarity
- Outputs:
  - `intent_confidence` (1–5)
  - `variation_width` (wide/medium/narrow)
- **Gate:** if score < threshold, return “need more clarity” with targeted questions.

3) `agent/spec`
- InterviewResult → BrandSpec (structured)
- Produces moodboard prompts, UI plan draft

4) `agent/generate`
- Candidate generation:
  - moodboard candidates
  - UI plan candidates
  - naming candidates
- Uses `variation_width`:
  - **wide** = diverse exploration
  - **medium** = balanced
  - **narrow** = refinements around user direction

5) `agent/score`
- Rule-based scoring + top-3 selection

6) `agent/discuss`
- Presents candidates with rationale (fit to product/audience)
- Asks user which feels closest; updates constraints and re-runs if needed.

7) `tokens/derive`
- After moodboard+ui_plan is approved, derive final tokens:
  - palette + typography + spacing + radius + shadow

8) `social/gen`
- Generate share-ready images aligned with brand/product:
  - X (1200×675), IG (1080×1080), Story (1080×1920)
- Generate captions + hashtags.

9) `codegen`
- **Components-first** generation
- Assemble into a **single page** (`/`) for v0
- Output into brand-pack/code/

10) `validate`
- eslint + tsc → validation.json

11) `self_heal`
- bounded auto-fix loop (max 3) if validation fails

12) `package`
- bundle files + sha256
- optional IPFS upload → CID

13) `chain/monad` (optional)
- mint BrandPackNFT
- TokenURI points to meta/CID

---

## Runtime flow (sequence)

1) UI: interview (mode A/B) + intent score (1–5) + references
2) API: intent_confidence module → variation_width 결정
3) If score < threshold: return targeted questions → loop
4) API: build spec
5) API: generate candidates (moodboard + UI plan + naming) n=20 → score → top3
6) UI: discuss & pick 1 (optional revise)
7) API: approve
   - finalize moodboard + ui_plan
   - derive tokens
   - generate social images + captions
   - components-first codegen → **single page** assembly
   - validate → self-heal loop
   - package → optional mint
8) UI: show outputs + validation + tx hash (if any)

---

## State machine contract

- Steps:
  - `interview_collect`
  - `intent_gate`
  - `spec_draft`
  - `candidates_generate`
  - `top3_select`
  - `approve_build`
  - `package`
  - `done`
- Runtime policies:
  - `AUTO_CONTINUE=true` => continue automatically until blocked
  - `AUTO_PICK_TOP1=true` => top1 auto-selection with user override
  - per session active job limit: `CONCURRENT_JOB_LIMIT` (default 1)
- Pause points:
  - confidence gate fail
  - pause action
  - conflicting/invalid control action
  - optional high-cost confirmation point (mint)

---

## APIs (v0.4)

- `POST /api/session/start`
- `POST /api/agent/run-step`
- `POST /api/chat`
- `POST /api/revise`
- `GET /api/jobs/:jobId`
- `GET /api/sessions/:sessionId`
- `GET /api/packs/:packId`
- `POST /api/mint` (optional)

---

## Guardrails (v0)
- candidate_count: 20
- top_k: 3
- revisions: 2
- images: 3
- social assets: 3 sizes + captions
- self_heal: 3
- code scope: single page only
- active_jobs_per_session: 1
