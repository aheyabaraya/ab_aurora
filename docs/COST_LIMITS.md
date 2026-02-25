# Cost Limits (v0)

## Policy
- Keep candidate generation bounded.
- For behavior testing, prefer deterministic fallback continuity over hard fail.

## Current enforced controls
- Candidate count: `20`
- Top-k return: `3`
- Revisions: `2`
- Self-heal attempts: `3`
- Social images: `3` outputs
- Concurrent jobs per session: `1`

## Behavior-test conservative profile
- `RUNTIME_ENABLED=false`
- `AUTO_CONTINUE=false`
- `CANDIDATE_COUNT=3`
- `TOP_K=3`
- `MAX_REVISIONS=0`
- `CONCURRENT_JOB_LIMIT=1`
- `OPENAI_FALLBACK_MODE=deterministic_mock`

## High-cost interaction triggers
- Repeated `Regenerate Top-3`
- Repeated revise constraints in chat quick actions
- Runtime loop with force replan

## API budget guard status
- `REQUEST_LIMIT_PER_DAY` and `IMAGE_LIMIT_PER_DAY` exist in env, but are not hard-enforced on OpenAI calls yet.

## Future hard guard (optional roadmap)
- Daily hard cap per environment
- Per-request max token/image budget
- Emit usage logs with request id and timestamp
