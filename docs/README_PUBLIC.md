# AB_Aurora — Brand Persona Director Agent

AB_Aurora helps builders who have a **real project idea** but **no clear design/aesthetic direction** turn intent into a complete brand system and verified UI code.

## What it does
- Guided interview with mandatory Q0 confidence input (works even with zero references)
- Stage-based pipeline with auto progression and wait-user gates
- Builds: brief → direction → concept bundles → selection → package
- Generates **share-ready social images** (X/IG/Story) that fit the brand/product
- Respects users with strong conviction and moves faster when direction is clear
- Generates verified code (Next.js + Tailwind) with lint/typecheck (bounded self-heal)
- Supports chat-driven control (candidate override / revise / follow-up generation)

## Current User Flow
1. Enter a concise brief:
   - product
   - audience
   - first deliverable
   - style keywords
   - design requirement
2. Aurora synthesizes a structured `direction` from that brief during `DEFINE`.
3. Aurora decides whether the brief is ready for concepts with `direction.clarity.ready_for_concepts`.
   - code still validates shape and safety
   - semantic readiness is AI-led
4. If the brief is still weak, Aurora asks targeted follow-up questions in chat.
5. If the brief is ready, Aurora generates 3 concept bundles in `EXPLORE`.
6. The user selects one route in `DECIDE`.
7. `BUILD/PACKAGE` uses the same `direction` plus the selected candidate to create social assets, package outputs, and final deliverables.

Direction is the canonical source of truth after `DEFINE`. Candidate prompts, social image prompts, and follow-up revision renders all derive from the active direction rather than from a separate hardcoded house style.

## Demo
- Live: <LIVE_DEMO_URL>
- Video: <DEMO_VIDEO_URL>
