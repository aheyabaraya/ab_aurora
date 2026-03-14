process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { runAgentPipeline } = require("../../.tmp-tests/lib/agent/orchestrator.js");
const { MemoryStorageRepository } = require("../../.tmp-tests/lib/storage/memory.js");

test("pipeline supports revise then rerun and keeps artifacts", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "AB Aurora Direction Engine For Product Teams",
    audience: "Vibe coders",
    style_keywords: ["bold", "minimal", "future"],
    auto_continue: true,
    auto_pick_top1: true
  });

  const firstRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_integration_001"
    }
  });
  assert.equal(firstRun.current_step, "brand_narrative");
  assert.equal(firstRun.status, "wait_user");

  const conceptsRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "proceed",
      idempotency_key: "idem_integration_001b"
    }
  });
  assert.equal(conceptsRun.current_step, "top3_select");
  assert.equal(conceptsRun.wait_user, true);

  const selectionRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "select_candidate",
      payload: {
        candidate_id: "cand_1"
      },
      idempotency_key: "idem_integration_001c"
    }
  });
  assert.equal(selectionRun.current_step, "approve_build");

  const buildRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "proceed",
      idempotency_key: "idem_integration_001d"
    }
  });
  assert.equal(buildRun.current_step, "done");
  assert.equal(buildRun.status, "completed");
  assert.ok(buildRun.selected_candidate_id);

  const reviseRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "revise_constraint",
      payload: {
        constraint: "Make typography more editorial and reduce neon contrast."
      },
      idempotency_key: "idem_integration_002"
    }
  });

  assert.equal(reviseRun.current_step, "approve_build");
  const refreshedSession = await storage.getSession(session.id);
  assert.ok(refreshedSession);
  assert.equal(refreshedSession.current_step, "approve_build");
  assert.ok(refreshedSession.revision_count >= 1);

  const followup = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "generate_followup_asset",
      payload: {
        asset_type: "social_story"
      },
      idempotency_key: "idem_integration_003"
    }
  });
  assert.equal(followup.status, "wait_user");
  const artifacts = await storage.listArtifactsBySession(session.id);
  assert.ok(artifacts.some((artifact) => artifact.kind === "followup_asset"));
});
