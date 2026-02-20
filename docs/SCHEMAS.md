# docs/SCHEMAS.md — AB_Aurora Schemas (v0.3)

> Goal: Lock **BrandSpec** and **TokenURI (BrandPackNFT)** metadata so Codex can implement immediately.

> NOTE (sequence): In v0, **Moodboard is generated/selected before Tokens**.  
> Tokens are finalized after the user approves moodboard + UI plan.

---

## 1) BrandSpec (brand.spec.json)

### Minimal required fields (v0)
- `version`, `mode`
- `intent` (confidence-aware):
  - `has_direction: boolean`
  - `intent_confidence: 1|2|3|4|5`
  - `variation_width: "wide"|"medium"|"narrow"`
  - `direction_source: "user"|"agent"` (optional)
- `input` (interview answers)
- `persona` (summary/values/voice) *(can be minimal when confidence high)*
- `naming` (candidates + recommended) *(optional if user already has naming)*
- `moodboard` (prompts + outputs)
- `ui_plan` (IA/components/CTA)
- `tokens` (finalized after approval)
- `social_assets` (output URIs + captions)
- `code_plan` (stack/quality gates/self-heal; **single page only in v0**)
- `scoring` (candidate_count/top_k/rules)

### Runtime split (v0.4)
- `BrandSpecDraft`:
  - stage=`draft`
  - required: version/mode/intent/input/scoring
  - optional: persona/naming/moodboard/ui_plan/tokens/social_assets/code_plan
- `BrandSpecFinal`:
  - stage=`final`
  - required: selected candidate + finalized moodboard/ui_plan/tokens/social_assets/code_plan
  - includes Top-3 snapshot and selected candidate id

---

## 2) Social Assets (required outputs)

- `post_1200x675` (X/Twitter)
- `post_1080x1080` (IG square)
- `post_1080x1920` (Story)
- `captions.md` (2–3 caption options + 5–10 hashtags)

---

## 3) Runtime state schemas (new)

### `Session`
- `id`
- `mode`
- `product`, `audience`, `style_keywords`
- `current_step`
- `status`
- `auto_continue`, `auto_pick_top1`
- `intent_confidence`, `variation_width`
- `latest_top3`, `selected_candidate_id`
- `draft_spec`, `final_spec`
- `revision_count`

### `Job`
- `id`, `session_id`
- `step`
- `status` (`pending|running|completed|failed|canceled`)
- `payload`, `logs`, `error`

### `Artifact`
- `id`, `session_id`, `job_id`
- `step`, `kind`, `title`
- `content`
- `hash`
- `created_at`

### `ChatAction`
- `type`:
  - `revise_constraint`
  - `rerun_candidates`
  - `select_candidate`
  - `proceed`
  - `pause`
  - `resume`
  - `generate_followup_asset`
- `payload`
- `raw`

### `StepRunRequest`
- `session_id`
- `step?`
- `action?`
- `payload?`
- `idempotency_key`

### `StepRunResponse`
- `status`
- `current_step`
- `next_step`
- `wait_user`
- `job_id?`
- `artifacts[]`
- `selected_candidate_id`
- `latest_top3`

### Top-3 Candidate
- `id`
- `rank`
- `score`
- `naming`
- `moodboard`
- `ui_plan`
- `rationale`

---

## 4) TokenURI Metadata Schema (Brand Pack NFT)

**Messaging rule:** do NOT claim “ownership/registration.” Use **proof/provenance/origin** only.

### Example
```json
{
  "name": "AB_Aurora Brand Pack #0001",
  "description": "Provenance record for a generated Brand Pack (persona → moodboard → UI plan → tokens → social assets → verified code).",
  "image": "ipfs://<CID>/moodboard/hero.png",
  "external_url": "https://<app>/packs/<id>",
  "attributes": [
    {"trait_type": "mode", "value": "guided"},
    {"trait_type": "intent_confidence", "value": 3},
    {"trait_type": "candidate_count", "value": 20},
    {"trait_type": "lint", "value": "pass"},
    {"trait_type": "typecheck", "value": "pass"}
  ],
  "properties": {
    "bundle_uri": "ipfs://<CID>/brand-pack/",
    "bundle_hash": "<sha256>",
    "spec_version": "0.3",
    "models": {"llm": "openai", "image": "openai"},
    "created_at": "2026-02-12T00:00:00Z"
  }
}
```
