# Demo Script (v0)

## Goal
Show that AB_Aurora runs as a stage-based agent focused on Top-3 outputs, with chat control and follow-up generation.

## Runbook
1. Start app: `pnpm dev`
2. Start session in `agent_stage` mode (`/api/session/start`)
3. Trigger pipeline (`/api/agent/run-step`) and show auto progression
4. Verify Top-3 candidate artifact appears
5. Show auto top1 selection and generated outputs (tokens/social/code plan/validation)
6. Send chat override (example: `2번 후보로 바꿔`) and show re-control
7. Run revise command and regenerate candidates
8. Generate follow-up asset through chat
9. (Optional) call `/api/mint` with a pack id when mint is enabled

## Proof to capture
- Top-3 candidate outputs with rank + score
- Job timeline (`jobs`)
- Artifact list (`artifacts`)
- Chat override evidence (action parsed and applied)
- Validation summary (`eslint`, `tsc`, attempts)
