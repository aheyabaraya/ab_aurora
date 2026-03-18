process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  toVariationWidth,
  generateDeterministicCandidates,
  selectTopCandidates
} = require("../../.tmp-tests/lib/agent/candidate.js");
const { parseChatAction } = require("../../.tmp-tests/lib/agent/chat-action.js");
const { runAgentPipeline } = require("../../.tmp-tests/lib/agent/orchestrator.js");
const { MemoryStorageRepository } = require("../../.tmp-tests/lib/storage/memory.js");

test("variation width mapping follows intent confidence", () => {
  assert.equal(toVariationWidth(1), "wide");
  assert.equal(toVariationWidth(2), "wide");
  assert.equal(toVariationWidth(3), "medium");
  assert.equal(toVariationWidth(4), "narrow");
  assert.equal(toVariationWidth(5), "narrow");
});

test("deterministic generation returns top-3 consistently", () => {
  const generated = generateDeterministicCandidates({
    sessionId: "sess_demo",
    product: "Aurora Builder",
    audience: "Founders",
    styleKeywords: ["bold", "minimal", "tech"],
    variationWidth: "medium",
    candidateCount: 20
  });
  const top3 = selectTopCandidates(generated, 3);
  assert.equal(top3.length, 3);
  assert.equal(top3[0].rank, 1);
  assert.ok(top3[0].score >= top3[1].score);
});

test("chat parser maps selection and revise actions", () => {
  const selectAction = parseChatAction("2번 후보로 바꿔");
  assert.equal(selectAction.type, "select_candidate");
  assert.deepEqual(selectAction.payload, { candidate_id: "cand_2" });

  const reviseAction = parseChatAction("톤을 더 미니멀하게 수정해줘");
  assert.equal(reviseAction.type, "refine_direction");

  const pauseAction = parseChatAction("pause for now");
  assert.equal(pauseAction.type, "pause");

  const proceedAction = parseChatAction("빌드 진행해줘");
  assert.equal(proceedAction.type, "proceed");
});

test("orchestrator lets AI judge placeholder briefs at brand_narrative", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "Tool",
    audience: "Users",
    style_keywords: ["clean"],
    auto_continue: true,
    auto_pick_top1: true
  });

  const response = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_low_confidence_001"
    }
  });

  assert.equal(response.wait_user, true);
  assert.equal(response.current_step, "brand_narrative");
  assert.match(response.message, /reply in chat|before concept generation|clearer brief/i);
});

test("concise but concrete brief can pass intent gate", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "AI landing page builder for solo founders",
    audience: "solo founders",
    style_keywords: ["clean"],
    auto_continue: true,
    auto_pick_top1: true
  });

  const response = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_concise_brief_001"
    }
  });

  assert.equal(response.current_step, "brand_narrative");
  assert.equal(response.wait_user, true);
  assert.match(response.message, /Direction synthesized|generate concept bundles/i);
});

test("interview_collect keeps pre-seeded q0 intent confidence", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "Aurora Builder",
    audience: "Founders",
    style_keywords: ["calm", "editorial"],
    q0_intent_confidence: 2,
    auto_continue: false,
    auto_pick_top1: true
  });

  const response = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_q0_seed_001"
    }
  });

  const refreshed = await storage.getSession(session.id);
  assert.equal(response.current_step, "intent_gate");
  assert.equal(refreshed.intent_confidence, 2);
  assert.equal(refreshed.variation_width, "wide");
});

test("spec_draft transitions to brand_narrative and persists direction artifact", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "Aurora Direction Engine",
    audience: "Founders",
    style_keywords: ["bold", "minimal", "ritual"],
    q0_intent_confidence: 5,
    auto_continue: false,
    auto_pick_top1: true
  });

  await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_narrative_001"
    }
  });
  await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_narrative_002"
    }
  });
  const draftRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_narrative_003"
    }
  });
  assert.equal(draftRun.current_step, "brand_narrative");

  const narrativeRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_narrative_004"
    }
  });
  assert.equal(narrativeRun.current_step, "brand_narrative");
  assert.equal(narrativeRun.wait_user, true);
  assert.ok(narrativeRun.artifacts.some((artifact) => artifact.kind === "brand_narrative"));
});

test("placeholder brief is clarified after direction synthesis instead of blocking intent_gate", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "AI tool",
    audience: "users",
    style_keywords: ["modern"],
    design_direction_note: "Open direction. Explore broadly.",
    q0_intent_confidence: 4,
    auto_continue: true,
    auto_pick_top1: true
  });

  const firstRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_define_gate_001"
    }
  });

  assert.equal(firstRun.current_step, "brand_narrative");
  assert.equal(firstRun.wait_user, true);
  assert.match(firstRun.message, /reply in chat|before concept generation|clearer brief/i);

  const blockedProceed = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "proceed",
      idempotency_key: "idem_define_gate_002"
    }
  });

  assert.equal(blockedProceed.current_step, "brand_narrative");
  assert.equal(blockedProceed.wait_user, true);
  assert.equal(blockedProceed.latest_top3, null);
  assert.match(blockedProceed.message, /reply in chat|clarity|before concept generation/i);
});

test("brand_narrative can proceed with sparse tone guidance when product and audience are concrete", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "AI landing page builder for solo founders shipping their first SaaS launch",
    audience: "solo founders shipping early-stage SaaS products",
    style_keywords: ["premium"],
    design_direction_note: "Open direction. Explore broadly.",
    q0_intent_confidence: 4,
    auto_continue: true,
    auto_pick_top1: true
  });

  const firstRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_define_gate_sparse_001"
    }
  });

  assert.equal(firstRun.current_step, "brand_narrative");
  assert.equal(firstRun.wait_user, true);
  assert.match(firstRun.message, /generate concept bundles/i);

  const proceedRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "proceed",
      idempotency_key: "idem_define_gate_sparse_002"
    }
  });

  assert.equal(proceedRun.current_step, "top3_select");
  assert.equal(proceedRun.wait_user, true);
  assert.equal(proceedRun.latest_top3.length, 3);
});

test("approve_build requires explicit proceed when auto_pick_top1 is disabled", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "Aurora Direction Engine for Product Teams and Brand Operators",
    audience: "Founders and design leads",
    style_keywords: ["bold", "editorial", "futuristic"],
    auto_continue: true,
    auto_pick_top1: false
  });

  const firstRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_build_gate_001"
    }
  });
  assert.equal(firstRun.current_step, "brand_narrative");
  assert.equal(firstRun.wait_user, true);

  const top3Run = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "proceed",
      idempotency_key: "idem_build_gate_001b"
    }
  });
  assert.equal(top3Run.current_step, "top3_select");
  assert.equal(top3Run.wait_user, true);

  const selectRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "select_candidate",
      payload: {
        candidate_id: "cand_1"
      },
      idempotency_key: "idem_build_gate_002"
    }
  });

  assert.equal(selectRun.current_step, "approve_build");
  assert.equal(selectRun.wait_user, true);
  assert.match(selectRun.message, /Build when ready/i);
});

test("proceed action passes approve_build gate and finishes pipeline", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "Aurora Direction Engine for Product Teams and Brand Operators",
    audience: "Founders and design leads",
    style_keywords: ["bold", "editorial", "futuristic"],
    auto_continue: true,
    auto_pick_top1: false
  });

  await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_build_gate_003"
    }
  });

  await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "proceed",
      idempotency_key: "idem_build_gate_003b"
    }
  });

  await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "select_candidate",
      payload: {
        candidate_id: "cand_1"
      },
      idempotency_key: "idem_build_gate_004"
    }
  });

  const proceedRun = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "proceed",
      idempotency_key: "idem_build_gate_005"
    }
  });

  assert.equal(proceedRun.current_step, "done");
  assert.equal(proceedRun.status, "completed");
});

test("selected direction revisions are capped at MAX_REVISIONS", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "Aurora Direction Engine for Product Teams and Brand Operators",
    audience: "Founders and design leads",
    style_keywords: ["bold", "editorial", "futuristic"],
    auto_continue: true,
    auto_pick_top1: false
  });

  await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      idempotency_key: "idem_revision_cap_001"
    }
  });

  await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "proceed",
      idempotency_key: "idem_revision_cap_002"
    }
  });

  await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "select_candidate",
      payload: {
        candidate_id: "cand_1"
      },
      idempotency_key: "idem_revision_cap_003"
    }
  });

  const firstRevision = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "revise_constraint",
      payload: {
        constraint: "Make it more editorial and slightly calmer."
      },
      idempotency_key: "idem_revision_cap_004"
    }
  });
  assert.equal(firstRevision.current_step, "approve_build");
  assert.match(firstRevision.message, /revision rendered/i);

  const secondRevision = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "generate_followup_asset",
      payload: {
        prompt: "Keep composition but reduce contrast."
      },
      idempotency_key: "idem_revision_cap_005"
    }
  });
  assert.equal(secondRevision.current_step, "approve_build");
  assert.match(secondRevision.message, /revision rendered/i);

  const blockedThirdRevision = await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      action: "revise_constraint",
      payload: {
        constraint: "One more revision."
      },
      idempotency_key: "idem_revision_cap_006"
    }
  });

  assert.equal(blockedThirdRevision.current_step, "approve_build");
  assert.equal(blockedThirdRevision.wait_user, true);
  assert.match(blockedThirdRevision.message, /Revision limit reached/i);

  const artifacts = await storage.listArtifactsBySession(session.id);
  const followupAssets = artifacts.filter((artifact) => artifact.kind === "followup_asset");
  assert.equal(followupAssets.length, 2);
});
