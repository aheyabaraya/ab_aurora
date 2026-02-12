# Demo Script (v0)

## Goal
Show that AB_Aurora works end-to-end from interview to validated code.

## Runbook
1. Start app: `pnpm dev`
2. Show interview entry (Mode A / Mode B)
3. Input confidence `< 4` and show clarify gate behavior
4. Raise confidence to `>= 4` and proceed
5. Show candidate generation + top-3 selection
6. Approve one option and generate tokens/social/code
7. Show lint/typecheck pass result

## Proof to capture
- Confidence gating decision
- Top-3 candidate outputs
- Validation summary (`eslint`, `tsc`, attempts)
