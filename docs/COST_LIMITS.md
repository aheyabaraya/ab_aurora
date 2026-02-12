# Cost Limits (v0)

## Policy
- Keep candidate generation bounded.
- Fail early when budget is exceeded.

## Default limits
- Candidate count: `20`
- Top-k return: `3`
- Revisions: `2`
- Self-heal attempts: `3`
- Social images: `3` outputs

## API budget guard (suggested)
- Daily hard cap per environment
- Per-request max token/image budget
- Emit usage logs with request id and timestamp
