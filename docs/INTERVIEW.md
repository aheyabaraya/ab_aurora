# docs/INTERVIEW.md — AB_Aurora Interview (v0.4)

> Goal: Start even from blank, and force convergence on **3-way fit (Creator taste × Audience taste × Product fit)**.  
> Principle: Every question must map to a concrete output.  
> v0.4: Q0 is first-class input, and `brand_narrative` is required before candidate generation.

---

## 0) Modes

### Mode A — Reference-driven
- Input: up to 3 reference images or links/notes
- Process: extract mood/temperature/texture/typography tendencies → ask only the minimum required questions.

### Mode B — Guided(Blank)
- Input: text only
- Process: run core questions sequentially until confidence is high enough.

---

## 1) Intent Gate (must ask early)

### Q0. How clear is your design mood right now? (1–5)
- **1**: no idea at all  
- **2**: vague hints  
- **3**: some direction but not confident  
- **4**: clear direction  
- **5**: very clear / fixed conviction
- Guided UI requires this answer before `Start Session`.
- Request field: `q0_intent_confidence` (`1..5`) on `POST /api/session/start`.

Also capture:
- `has_direction` (bool): Do you already have a moodboard / fixed tone?
- If yes: attach references (links/images) and specify **what must NOT change**.

**Gate rule (must enforce):**
- Q0 is the initial source-of-truth score when provided.
- `interview_collect` must not overwrite an existing intent score.
- If confidence **< 4**, AB_Aurora should say:
  - “We’re not clear enough yet to lock the design. Let’s clarify a bit more.”
  and ask targeted questions until ≥4.

---

## 2) Reference Strength Rule (critical)

Persona/story + moodboard requires **clear signals**.

If the user’s references are too weak to infer storyline/mood:
- request stronger references (more concrete adjectives, comparable brands, UI examples)
- or add constraints (“keep X, avoid Y, must feel like Z”)
- keep clarifying until confidence ≥4

---

## 3) Core Questions (targeted)

### Q1. Product (what are you making?)
One sentence.

### Q2. Audience (who is it for?)
One sentence.

### Q3. Primary action on first screen
What do you want users to do immediately?

### Q4. 3 vibe keywords
3 words.

### Q5. 3 anti-goals
3 things you hate / must avoid.

### Q6. Taste anchors
- preferred: 1–3 references (links/images)
- optional: pick archetype: minimal / bold / editorial / playful / futuristic / organic

### Q7. Constraints
mobile-first, readability, accessibility, dark-only, etc.

### Q8. Brand promise + differentiator
Two one-liners.

### Q9. Color temperature & material
cool/warm/neutral/mixed + clean/paper/neon/etc.

---

## 4) Revision Controls (v0)

- max revisions: **2**
- knobs:
  1) Minimal ↔ Expressive (0–100)
  2) Serious ↔ Playful (0–100)
  + 1 constraint line (“make it more ___, avoid ___”)

---

## 5) Output Requirements (Interview → decisions)

Interview must produce decisions in this order:

1) `intent`:
   - `has_direction` (bool)
   - `intent_confidence` (1–5)
   - `variation_width` (wide|medium|narrow)
2) `brand_narrative`:
   - `brand_promise` (1 sentence)
   - `audience_tension` (1 sentence)
   - `story_arc` (3 beats)
   - `voice_do` (3)
   - `voice_dont` (3)
   - `tagline_candidates` (3)
3) `persona_summary` (optional/minimal if user has strong direction)
4) `voice` (tone do/don’t)
5) `moodboard_prompt` (positive + negative prompt)
6) `ui_plan` (IA + sections + key components)
7) `tokens_hint` (direction only; **final tokens after moodboard+ui_plan selection**)
8) `social_assets_plan` (what to post, sizes, copy tone)
9) `code_plan` (stack preset + file generation plan; **single page only in v0**)
