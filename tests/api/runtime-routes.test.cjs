process.env.NODE_ENV = "test";
process.env.RUNTIME_ENABLED = "true";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AUTH_TEST_USER_ID,
  createAuthFetchMock,
  authJsonHeaders
} = require("../helpers/auth-fetch.cjs");

const { POST: startSession } = require("../../.tmp-tests/app/api/session/start/route.js");
const { POST: runtimeStart } = require("../../.tmp-tests/app/api/runtime/start/route.js");
const { POST: runtimeStep } = require("../../.tmp-tests/app/api/runtime/step/route.js");
const { GET: runtimeGoalGet } = require("../../.tmp-tests/app/api/runtime/goals/[goalId]/route.js");

async function json(response) {
  return await response.json();
}

test.before(() => {
  global.fetch = createAuthFetchMock({
    userId: AUTH_TEST_USER_ID,
    hasAuroraAccess: true,
    onboardingComplete: true
  });
});

test("runtime start/step/goals endpoints execute end-to-end", async () => {
  const createResponse = await startSession(
    new Request("http://localhost/api/session/start", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        mode: "mode_b",
        product: "AB Aurora Direction Engine",
        audience: "Founders",
        style_keywords: ["bold", "minimal", "editorial"],
        design_direction_note: "Keep serif hierarchy and avoid glossy gradients.",
        auto_continue: true,
        auto_pick_top1: true
      })
    })
  );
  const created = await json(createResponse);

  const startReqBody = {
    session_id: created.session_id,
    goal_type: "deliver_demo_pack",
    idempotency_key: "idem_runtime_start_001"
  };

  const startedResponse = await runtimeStart(
    new Request("http://localhost/api/runtime/start", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify(startReqBody)
    })
  );
  assert.equal(startedResponse.status, 200);
  const started = await json(startedResponse);
  assert.ok(started.goal_id);

  const startedAgainResponse = await runtimeStart(
    new Request("http://localhost/api/runtime/start", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify(startReqBody)
    })
  );
  const startedAgain = await json(startedAgainResponse);
  assert.equal(startedAgain.goal_id, started.goal_id);

  const stepRequestBody = {
    goal_id: started.goal_id,
    idempotency_key: "idem_runtime_step_001"
  };

  const stepResponse = await runtimeStep(
    new Request("http://localhost/api/runtime/step", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify(stepRequestBody)
    })
  );
  assert.equal(stepResponse.status, 200);
  const stepped = await json(stepResponse);
  assert.ok(["running", "completed", "wait_user"].includes(stepped.goal_status));

  const stepReplayResponse = await runtimeStep(
    new Request("http://localhost/api/runtime/step", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify(stepRequestBody)
    })
  );
  assert.equal(stepReplayResponse.status, 200);

  const snapshotResponse = await runtimeGoalGet(new Request("http://localhost", { headers: authJsonHeaders() }), {
    params: Promise.resolve({ goalId: started.goal_id })
  });
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await json(snapshotResponse);
  assert.equal(snapshot.goal.id, started.goal_id);
  assert.ok(Array.isArray(snapshot.plans));
  assert.ok(snapshot.plans.length >= 1);
  assert.ok(Array.isArray(snapshot.actions));
  assert.ok(snapshot.actions.length >= 1);
  assert.ok(Array.isArray(snapshot.events));
  assert.ok(snapshot.events.length >= 1);
});

test("runtime requires explicit proceed at approve_build when auto_pick_top1 is false", async () => {
  const createResponse = await startSession(
    new Request("http://localhost/api/session/start", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        mode: "mode_b",
        product: "Aurora Direction Engine for Product Teams and Brand Operators",
        audience: "Founders",
        style_keywords: ["bold", "minimal", "editorial"],
        design_direction_note: "Keep serif hierarchy and avoid glossy gradients.",
        auto_continue: true,
        auto_pick_top1: false
      })
    })
  );
  const created = await json(createResponse);

  const startedResponse = await runtimeStart(
    new Request("http://localhost/api/runtime/start", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        session_id: created.session_id,
        goal_type: "deliver_demo_pack",
        idempotency_key: "idem_runtime_build_gate_001"
      })
    })
  );
  const started = await json(startedResponse);

  await runtimeStep(
    new Request("http://localhost/api/runtime/step", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        goal_id: started.goal_id,
        idempotency_key: "idem_runtime_build_gate_002"
      })
    })
  );

  await runtimeStep(
    new Request("http://localhost/api/runtime/step", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        goal_id: started.goal_id,
        action_override: {
          action_type: "select_candidate",
          payload: {
            candidate_id: "cand_1"
          }
        },
        idempotency_key: "idem_runtime_build_gate_003"
      })
    })
  );

  const gatedResponse = await runtimeStep(
    new Request("http://localhost/api/runtime/step", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        goal_id: started.goal_id,
        idempotency_key: "idem_runtime_build_gate_004"
      })
    })
  );
  const gated = await json(gatedResponse);
  assert.equal(gated.wait_user, true);
  assert.equal(gated.goal_status, "wait_user");
  assert.equal(gated.last_action?.tool_name, "tool.brand.ensure_outputs");
  assert.equal(gated.last_action?.output?.current_step, "approve_build");
  assert.equal(gated.last_action?.output?.wait_user, true);

  const resumedResponse = await runtimeStep(
    new Request("http://localhost/api/runtime/step", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        goal_id: started.goal_id,
        action_override: {
          action_type: "proceed"
        },
        idempotency_key: "idem_runtime_build_gate_005"
      })
    })
  );
  const resumed = await json(resumedResponse);
  assert.ok(["running", "completed"].includes(resumed.goal_status));
  assert.equal(resumed.goal_status === "failed", false);
});
