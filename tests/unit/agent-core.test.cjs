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
  assert.equal(reviseAction.type, "revise_constraint");

  const pauseAction = parseChatAction("pause for now");
  assert.equal(pauseAction.type, "pause");

  const proceedAction = parseChatAction("빌드 진행해줘");
  assert.equal(proceedAction.type, "proceed");
});

test("orchestrator pauses when confidence is below threshold", async () => {
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
  assert.equal(response.current_step, "intent_gate");
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
  assert.equal(firstRun.current_step, "top3_select");
  assert.equal(firstRun.wait_user, true);

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
  assert.match(selectRun.message, /Build confirmation required/i);
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
