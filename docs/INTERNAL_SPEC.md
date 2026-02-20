# AB_Aurora (ab_aurora) — Internal Spec (Codex Hand-off)

> Purpose: Lock the product definition + pipeline so Codex can implement immediately.  
> Public-facing docs are kept separately in README_PUBLIC.md.

---

## 0) Product Definition (locked)

**AB_Aurora is a Brand Persona Director Agent for vibe coders/builders.**

It helps users who have a **specific idea/project** but **lack design/aesthetic clarity** (or struggle to translate intent into a coherent brand + UI).

It aligns **(Creator taste × Audience taste × Product fit)** via a guided interview and produces:
- **Branding (when needed):** persona/story, naming, aesthetic direction
- **Design system:** moodboard → UI plan → tokens
- **Social assets:** shareable images for social posting (brand-fit)
- **Build output:** verified UI code (Next.js + Tailwind) + validation report

**Important:** AB_Aurora must **follow the user’s real intent**.  
If the user already has a strong mood/conviction (moodboard or clear direction), the agent must **respect it** and move faster to UI/tokens/code.

---

## 1) Brand Pack Output — Sequence (locked)

> Key rationale: humans often struggle to “sense” the right aesthetic mood; therefore **Moodboard comes before Tokens**.  
> Confidence is numeric **1–5**. If confidence is too low, the agent must keep clarifying before proceeding.

**Output sequence (must match UI flow):**
1) **Persona & Story** (brand.persona.md) — *can be minimal/optional if user has clear direction*
2) **Naming** (naming.md) — *optional if user already has naming*
3) **Moodboard** (moodboard/hero + variations)
4) **UI Plan** (ui.plan.md)
5) **Tokens** (brand.tokens.json)  ← derived from selected moodboard + UI plan
6) **Social Assets** (social/*) ← share-ready images + suggested captions/hashtags
7) **Code** (code/*)  ← generated using tokens
8) **Validation** (validation.json)  ← eslint + tsc (with bounded self-heal)

Optional (preferred if stable in v0):
9) **Provenance on Monad**: package (CID/hash) → Brand Pack NFT mint

---

## 2) “Agent-ness” (judging/demo)

- **Design-space search (confidence-aware):** generate candidates → score/filter → show top-3  
  - confidence **1–2** → wide variation (explore)  
  - confidence **3** → medium variation  
  - confidence **4–5** → narrow variation (refine)
- **Self-heal build loop:** codegen → eslint/tsc fail → auto-fix (bounded) → pass  
- **Provenance:** versioned bundle hash/CID; optional onchain mint

---

## 3) Target User (locked)

Primary:
- Users who already have a **concrete idea/project** but:
  - cannot define brand mood/aesthetic,
  - cannot translate taste into UI/UX,
  - or cannot build consistent tokens/components.

Secondary:
- Vibe coders/hackathon teams who want **brand+UI direction + ready-to-run code** quickly.

---

## 4) Modes (required)

- **Mode A — Reference-driven:** up to 3 reference images/links/notes
- **Mode B — Guided(Blank):** no reference needed; interview drives convergence

---

## 5) Reference Strength Rule (must enforce)

Persona/story + moodboard quality depends on reference clarity.

- If the user provides references but they are **too weak/ambiguous** to infer storyline/mood,
  AB_Aurora must **ask for stronger references** (more specific descriptors, links, or constraints)
  until confidence reaches the threshold to proceed.

---

## 6) Brand Pack (bundle structure)

```
/brand-pack/
  brand.persona.md          (can be minimal)
  naming.md                 (optional content)
  moodboard/
    hero.png
    v1.png
    v2.png
  ui.plan.md
  brand.tokens.json
  social/
    post_1200x675.png       (X/Twitter)
    post_1080x1080.png      (IG square)
    post_1080x1920.png      (Story)
    captions.md
  code/
    (Next.js project snapshot OR patch)
  validation.json
  meta.json
```

validation.json must include: eslint, tsc, schema, attempts, timing.

---

## 7) Pipeline (locked)

### 7.1 Intent & Confidence (must run first)
1) Detect:
- `has_direction`: user already has moodboard / strong conviction? (bool)
- `intent_confidence`: **1–5** (subjective clarity score)
- `variation_width`: wide | medium | narrow (derived from intent_confidence)

**Gate:** If `intent_confidence` < **4**, AB_Aurora should say:
> “We’re not clear enough yet. Let’s clarify a bit more before locking the design.”
and ask targeted questions to raise confidence.

### 7.2 Clarify → Discuss
2) Clarify user intent (what they’re making / who it’s for / desired feel).
3) Discuss tradeoffs with the user: what option fits the product/audience best.

### 7.3 Generation
4) BrandSpec generation (structured; includes confidence)
5) Candidate generation: **moodboard + UI plan + naming**
   - wide/medium/narrow based on confidence score
6) Auto scoring/filter → Top-3
7) Revision loop (max 2)

### 7.4 Approval → Build
8) Approve: finalize **moodboard + UI plan**
9) Derive **tokens** from chosen moodboard + UI plan
10) Generate **social assets** (brand-fit images + captions)
11) Codegen (**components-first → single page assembly**)  ← v0 scope
12) Validate (eslint + tsc)
13) Self-heal (max 3)
14) Package (hash/CID)
15) Optional: mint on Monad (Brand Pack NFT)

---

## 7.5 Runtime execution semantics (agent-stage)

- Runtime is a stage state machine:
  - `interview_collect -> intent_gate -> spec_draft -> candidates_generate -> top3_select -> approve_build -> package -> done`
- Auto-run defaults:
  - `auto_continue=true`
  - `auto_pick_top1=true`
- `wait_user` is mandatory only when:
  - `intent_confidence < INTENT_CLARIFY_THRESHOLD`
  - explicit pause / conflict / invalid selection
  - high-cost action requiring confirmation (mint, large reruns)
- Chat is a **control channel**, not the execution engine:
  - chat input is parsed into structured actions
  - all execution still goes through `run-step` pipeline
- Every step must produce at least one persisted artifact so intermediate review and follow-up work is possible.

---

## 8) v0 Code Output Scope (locked)

- **Single page only** (one route `/`)  
- Build in components-first style, then assemble into the full page.
- No multi-page routing in v0.

---

## 9) Stack Decisions (locked)

- Next.js (App Router) + TypeScript + Tailwind
- Quality gates: ESLint + `tsc`
- AI vendor: OpenAI only (text + image)

**UI component library decision (v0):**
- **No shadcn/ui in v0** (Tailwind-only components) to reduce dependency/fragility.
- We can add a “shadcn mode” later if we want richer primitives.

---

## 10) Guardrails (required)

- Candidate count: default 20
- Top-k: 3
- Revisions: max 2
- Images: hero 1 + variations 2
- Social assets: 3 sizes (X/IG/Story) + captions
- Self-heal: max 3
- Input length limits + forbidden terms
- API keys server-side only
- Single active job per session (`CONCURRENT_JOB_LIMIT`)

---

## 11) Track Priority (locked)

- **Priority:** Agent Track (No Token)
- Optional later: Agent + Token Track (must be substantially different)

---

## 12) Team ownership (locked)

- **Sylph:** strategy/definition/track strategy/demo story
- **Becca:** implementation/pipeline/validation/mint/deploy
- **Aurora:** interview IP, brand templates, preview UX, quality bar
- Optional: Lexa (wording guardrails / licensing posture)
