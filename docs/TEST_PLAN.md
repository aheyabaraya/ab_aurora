# Test Plan (v0.4)

## Goal
Validate AB_Aurora as a stage-based agent with Top-3 outputs, auto top1 flow, chat control, and Supabase-compatible runtime contracts.

## Test matrix

### Unit (`tests/unit/*`)
- intent confidence -> variation width mapping
- deterministic candidate generation and Top-3 ranking
- chat action parser mapping (`select/revise/pause/resume`)
- low-confidence intent gate (`wait_user`)

### API (`tests/api/*`)
- `POST /api/session/start` happy path
- `POST /api/agent/run-step` end-to-end auto run
- `POST /api/chat` action parse + apply
- `GET /api/sessions/:sessionId` Top-3 retrieval

### Integration (`tests/integration/*`)
- end-to-end run to `done`
- revise flow reruns candidates
- follow-up asset generation after selection
- artifact persistence across steps

## Failure and recovery scenarios
- OpenAI failure with `OPENAI_FALLBACK_MODE=deterministic_mock` continues pipeline
- invalid or unknown chat action does not corrupt state
- missing selected candidate blocks `approve_build` with `wait_user`
- active job conflict blocks concurrent heavy step

## Demo acceptance checklist
- Top-3 artifact exists with rank + score
- auto top1 is visible and overrideable
- chat command changes state (select/revise)
- follow-up output artifact is generated
- packaging artifact includes bundle hash and pack id
