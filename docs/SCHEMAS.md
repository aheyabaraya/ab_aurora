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

---

## 2) Social Assets (required outputs)

- `post_1200x675` (X/Twitter)
- `post_1080x1080` (IG square)
- `post_1080x1920` (Story)
- `captions.md` (2–3 caption options + 5–10 hashtags)

---

## 3) TokenURI Metadata Schema (Brand Pack NFT)

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
