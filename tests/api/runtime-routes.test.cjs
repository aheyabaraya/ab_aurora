process.env.NODE_ENV = "test";
process.env.RUNTIME_ENABLED = "true";

const test = require("node:test");
const assert = require("node:assert/strict");

const { POST: startSession } = require("../../.tmp-tests/app/api/session/start/route.js");
const { POST: runtimeStart } = require("../../.tmp-tests/app/api/runtime/start/route.js");
const { POST: runtimeStep } = require("../../.tmp-tests/app/api/runtime/step/route.js");
const { GET: runtimeGoalGet } = require("../../.tmp-tests/app/api/runtime/goals/[goalId]/route.js");

async function json(response) {
  return await response.json();
}

test("runtime start/step/goals endpoints execute end-to-end", async () => {
  const createResponse = await startSession(
    new Request("http://localhost/api/session/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mode: "mode_b",
        product: "AB Aurora Direction Engine",
        audience: "Founders",
        style_keywords: ["bold", "minimal", "editorial"],
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
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(startReqBody)
    })
  );
  assert.equal(startedResponse.status, 200);
  const started = await json(startedResponse);
  assert.ok(started.goal_id);

  const startedAgainResponse = await runtimeStart(
    new Request("http://localhost/api/runtime/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
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
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(stepRequestBody)
    })
  );
  assert.equal(stepResponse.status, 200);
  const stepped = await json(stepResponse);
  assert.ok(["running", "completed", "wait_user"].includes(stepped.goal_status));

  const stepReplayResponse = await runtimeStep(
    new Request("http://localhost/api/runtime/step", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(stepRequestBody)
    })
  );
  assert.equal(stepReplayResponse.status, 200);

  const snapshotResponse = await runtimeGoalGet(new Request("http://localhost"), {
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
