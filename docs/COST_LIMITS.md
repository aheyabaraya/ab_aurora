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
- OpenAI chat replies per session (rolling 24h): `CHAT_OPENAI_LIMIT_PER_DAY` (default `30`)

## Behavior-test conservative profile
- `RUNTIME_ENABLED=false`
- `AUTO_CONTINUE=false`
- `CANDIDATE_COUNT=3`
- `TOP_K=3`
- `MAX_REVISIONS=0`
- `CONCURRENT_JOB_LIMIT=1`
- `OPENAI_FALLBACK_MODE=deterministic_mock`

Strict real-call profile (no mock fallback):
- `OPENAI_FALLBACK_MODE=none`
- keep `CANDIDATE_COUNT=3` to control spend during smoke tests

## High-cost interaction triggers
- Repeated `Regenerate Top-3`
- Repeated revise constraints in chat quick actions
- Runtime loop with force replan

## API budget guard status
- `/api/chat` has an enforced per-session rolling 24h OpenAI guard (`CHAT_OPENAI_LIMIT_PER_DAY`).
- `REQUEST_LIMIT_PER_DAY` and `IMAGE_LIMIT_PER_DAY` still exist as broader config placeholders and are not globally hard-enforced across all OpenAI paths yet.

## Future hard guard (optional roadmap)
- Daily hard cap per environment
- Per-request max token/image budget
- Emit usage logs with request id and timestamp
