# Decisions Log

## 2026-02-26
### Decision
Use OpenAI-first assistant generation on `/api/chat`, with graceful degrade (`rate_limited`/`fallback`) instead of failing user actions.

### Why
- Keeps slash-driven pipeline continuity even when chat budget or provider health is constrained.
- Preserves user command side effects while making assistant source explicit for observability.

### Revisit trigger
- If global budget governance is added beyond per-session 24h guard, revisit the degrade policy and response shape.

## 2026-02-26
### Decision
Generate `social_assets` images via `OPENAI_MODEL_IMAGE` during `approve_build`, with fallback controlled by `OPENAI_FALLBACK_MODE`.

### Why
- Aligns package outputs with real model-backed assets instead of static placeholders.
- Preserves deterministic behavior tests via mock fallback, and allows strict failure mode with `none`.

### Revisit trigger
- If binary asset storage/export requirements become strict, replace URL/data-URI references with managed blob storage.

## 2026-02-26
### Decision
Default release gate for chat behavior remains mock-contract tests, not real-key E2E calls.

### Why
- Avoids noisy spend and flaky provider dependencies in CI while keeping API contract fixed.
- Covers OpenAI success, rate limit, and fallback paths deterministically.

### Revisit trigger
- If pre-prod smoke automation requires real provider validation, add opt-in single-call canary tests.

## 2026-02-12
### Decision
Use `Next.js + TypeScript + Tailwind` as the v0 baseline.

### Why
- Matches locked stack in `docs/INTERNAL_SPEC.md`.
- Supports single-page v0 scope and fast iteration.
- Keeps dependency surface smaller than adding UI libraries at bootstrap.

### Revisit trigger
- If component complexity increases, evaluate adding a component library in v1.

---

## Template
### YYYY-MM-DD
### Decision
...

### Why
...

### Revisit trigger
...
