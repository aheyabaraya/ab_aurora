process.env.NODE_ENV = "test";
process.env.RUNTIME_MEMORY_PERSIST = "true";

const test = require("node:test");
const assert = require("node:assert/strict");

const { planRuntimeStep } = require("../../.tmp-tests/lib/runtime/planner.js");
const { evaluateRuntimePolicy } = require("../../.tmp-tests/lib/runtime/policy.js");
const { evaluateRuntimeProgress } = require("../../.tmp-tests/lib/runtime/evaluator.js");
const {
  buildBrandKey,
  collectRuntimeMemory,
  writeRuntimeMemory
} = require("../../.tmp-tests/lib/runtime/memory.js");
const { MemoryStorageRepository } = require("../../.tmp-tests/lib/storage/memory.js");

test("planner chooses ensure_top3 when candidates are missing", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "AB Aurora",
    audience: "Founders",
    style_keywords: ["bold", "minimal"],
    auto_continue: true,
    auto_pick_top1: true
  });

  const plan = planRuntimeStep({
    session,
    artifacts: [],
    memories: []
  });

  assert.equal(plan.next_action.tool_name, "tool.brand.ensure_top3");
  assert.equal(plan.stop_condition, "done_with_pack");
});

test("policy denies brand action when concurrent slot is occupied", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "AB Aurora",
    audience: "Founders",
    style_keywords: ["bold", "minimal"],
    auto_continue: true,
    auto_pick_top1: true
  });

  const result = evaluateRuntimePolicy({
    session,
    action: {
      action_type: "ensure_outputs",
      tool_name: "tool.brand.ensure_outputs",
      input: {
        session_id: session.id
      },
      reason: "test"
    },
    activeJobs: 1
  });

  assert.equal(result.decision, "deny");
});

test("evaluator passes when done + required artifacts exist", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "AB Aurora",
    audience: "Founders",
    style_keywords: ["bold", "minimal"],
    auto_continue: true,
    auto_pick_top1: true
  });

  await storage.updateSession(session.id, {
    current_step: "done",
    status: "completed",
    selected_candidate_id: "cand_1",
    latest_top3: [
      {
        id: "cand_1",
        rank: 1,
        score: 0.91,
        naming: {
          recommended: "AuroraOne",
          candidates: ["AuroraOne"]
        },
        moodboard: {
          title: "A",
          prompt: "A",
          colors: ["#111", "#222", "#333"]
        },
        ui_plan: {
          headline: "A",
          layout: ["hero", "cta"],
          cta: "Start"
        },
        rationale: "A"
      },
      {
        id: "cand_2",
        rank: 2,
        score: 0.9,
        naming: {
          recommended: "AuroraTwo",
          candidates: ["AuroraTwo"]
        },
        moodboard: {
          title: "B",
          prompt: "B",
          colors: ["#111", "#222", "#333"]
        },
        ui_plan: {
          headline: "B",
          layout: ["hero", "cta"],
          cta: "Start"
        },
        rationale: "B"
      },
      {
        id: "cand_3",
        rank: 3,
        score: 0.89,
        naming: {
          recommended: "AuroraThree",
          candidates: ["AuroraThree"]
        },
        moodboard: {
          title: "C",
          prompt: "C",
          colors: ["#111", "#222", "#333"]
        },
        ui_plan: {
          headline: "C",
          layout: ["hero", "cta"],
          cta: "Start"
        },
        rationale: "C"
      }
    ]
  });

  const kinds = ["tokens", "social_assets", "code_plan", "validation", "pack_meta"];
  for (const kind of kinds) {
    await storage.createArtifact({
      session_id: session.id,
      step: "done",
      kind,
      title: kind,
      content: {
        kind
      }
    });
  }

  const refreshed = await storage.getSession(session.id);
  const artifacts = await storage.listArtifactsBySession(session.id);
  const evaluation = evaluateRuntimeProgress({
    session: refreshed,
    artifacts
  });

  assert.equal(evaluation.pass, true);
  assert.equal(evaluation.scores.goal_fit >= 0.8, true);
});

test("memory writer stores session and brand memories", async () => {
  const storage = new MemoryStorageRepository();
  const session = await storage.createSession({
    mode: "mode_b",
    product: "AB Aurora",
    audience: "Founders",
    style_keywords: ["bold", "minimal"],
    auto_continue: true,
    auto_pick_top1: true
  });
  await storage.updateSession(session.id, {
    selected_candidate_id: "cand_2"
  });

  await writeRuntimeMemory({
    storage,
    session: (await storage.getSession(session.id)),
    action: {
      id: "rt_act_test",
      goal_id: "rt_goal_test",
      plan_id: "rt_plan_test",
      step_no: 1,
      action_type: "ensure_selection",
      tool_name: "tool.brand.ensure_selection",
      action_input: {
        session_id: session.id
      },
      policy_result: "allow",
      status: "completed",
      idempotency_key: null,
      output: {
        selected_candidate_id: "cand_2"
      },
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      finished_at: new Date().toISOString()
    },
    evaluation: {
      id: "rt_eval_test",
      goal_id: "rt_goal_test",
      plan_id: "rt_plan_test",
      action_id: "rt_act_test",
      scores: {
        goal_fit: 1
      },
      pass: true,
      reasons: ["ok"],
      next_hint: null,
      created_at: new Date().toISOString()
    }
  });

  const brandKey = buildBrandKey(await storage.getSession(session.id));
  const memoryBundle = await collectRuntimeMemory({
    storage,
    session: await storage.getSession(session.id)
  });

  assert.equal(memoryBundle.brandKey, brandKey);
  assert.ok(memoryBundle.memories.some((memory) => memory.memory_key === "last_action"));
  assert.ok(memoryBundle.memories.some((memory) => memory.memory_key === "preferred_candidate"));
});
