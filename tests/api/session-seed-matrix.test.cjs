process.env.NODE_ENV = "test";
process.env.RUNTIME_ENABLED = "true";
process.env.ENABLE_DEV_SEED_API = "true";
process.env.DEV_SEED_TOKEN = "seed-test-token";

const { randomUUID } = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");

const { POST: devSeedPost } = require("../../.tmp-tests/app/api/dev/seed/session/route.js");
const { POST: runStepPost } = require("../../.tmp-tests/app/api/agent/run-step/route.js");
const { POST: chatPost } = require("../../.tmp-tests/app/api/chat/route.js");
const { POST: revisePost } = require("../../.tmp-tests/app/api/revise/route.js");
const { POST: runtimeStartPost } = require("../../.tmp-tests/app/api/runtime/start/route.js");
const { POST: runtimeStepPost } = require("../../.tmp-tests/app/api/runtime/step/route.js");
const { GET: sessionsGet } = require("../../.tmp-tests/app/api/sessions/route.js");
const { GET: sessionGetById } = require("../../.tmp-tests/app/api/sessions/[sessionId]/route.js");
const { GET: jobsGet } = require("../../.tmp-tests/app/api/jobs/route.js");

const {
  loadDevSeedPostWithEnv,
  seedSessionViaApi
} = require("../helpers/session-seed.cjs");

function asJson(response) {
  return response.json();
}

function assertMessageSortedDesc(messages) {
  for (let index = 1; index < messages.length; index += 1) {
    assert.equal(messages[index - 1].created_at >= messages[index].created_at, true);
  }
}

test("POST /api/dev/seed/session creates deterministic presets", async () => {
  const expectations = {
    fresh: {
      current_step: "interview_collect",
      status: "idle",
      required_artifacts: []
    },
    top3_ready: {
      current_step: "top3_select",
      status: "running",
      required_artifacts: ["interview", "brand_spec_draft", "candidates_top3"]
    },
    selected_ready: {
      current_step: "approve_build",
      status: "running",
      required_artifacts: ["selection"]
    },
    build_confirm_required: {
      current_step: "approve_build",
      status: "wait_user",
      required_artifacts: ["selection"]
    },
    package_ready: {
      current_step: "package",
      status: "running",
      required_artifacts: ["tokens", "social_assets", "code_plan", "validation"]
    },
    done: {
      current_step: "done",
      status: "completed",
      required_artifacts: ["pack_meta"]
    }
  };

  for (const [preset, expected] of Object.entries(expectations)) {
    const { response, body } = await seedSessionViaApi({
      post: devSeedPost,
      preset,
      token: "seed-test-token"
    });
    assert.equal(response.status, 200);
    assert.equal(body.preset, preset);
    assert.equal(body.current_step, expected.current_step);
    assert.equal(body.status, expected.status);
    assert.ok(typeof body.seed_id === "string" && body.seed_id.length > 0);
    assert.ok(typeof body.session_id === "string" && body.session_id.length > 0);
    assert.ok(Array.isArray(body.artifact_kinds));
    for (const kind of expected.required_artifacts) {
      assert.equal(body.artifact_kinds.includes(kind), true);
    }
  }
});

test("POST /api/dev/seed/session rejects missing or invalid token", async () => {
  const missingTokenResponse = await devSeedPost(
    new Request("http://localhost/api/dev/seed/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        preset: "fresh"
      })
    })
  );
  assert.equal(missingTokenResponse.status, 401);

  const invalidTokenResponse = await devSeedPost(
    new Request("http://localhost/api/dev/seed/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-seed-token": "wrong-token"
      },
      body: JSON.stringify({
        preset: "fresh"
      })
    })
  );
  assert.equal(invalidTokenResponse.status, 401);
});

test("POST /api/dev/seed/session returns 404 when feature is disabled", async () => {
  const post = loadDevSeedPostWithEnv({
    NODE_ENV: "test",
    ENABLE_DEV_SEED_API: "false",
    DEV_SEED_TOKEN: "seed-test-token"
  });

  const response = await post(
    new Request("http://localhost/api/dev/seed/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-seed-token": "seed-test-token"
      },
      body: JSON.stringify({
        preset: "fresh"
      })
    })
  );
  assert.equal(response.status, 404);
});

test("POST /api/dev/seed/session returns 403 in production", async () => {
  const post = loadDevSeedPostWithEnv({
    NODE_ENV: "production",
    ENABLE_DEV_SEED_API: "true",
    DEV_SEED_TOKEN: "seed-test-token"
  });

  const response = await post(
    new Request("http://localhost/api/dev/seed/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-seed-token": "seed-test-token"
      },
      body: JSON.stringify({
        preset: "fresh"
      })
    })
  );
  assert.equal(response.status, 403);
});

test("seeded session exposes recent_messages in descending order", async () => {
  const seeded = await seedSessionViaApi({
    post: devSeedPost,
    preset: "top3_ready",
    token: "seed-test-token"
  });
  const sessionId = seeded.body.session_id;

  const chatResponse = await chatPost(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: sessionId,
        message: "Pick #1"
      })
    })
  );
  assert.equal(chatResponse.status, 200);

  const sessionResponse = await sessionGetById(new Request("http://localhost"), {
    params: Promise.resolve({ sessionId })
  });
  assert.equal(sessionResponse.status, 200);
  const body = await asJson(sessionResponse);
  assert.ok(Array.isArray(body.recent_messages));
  assert.equal(body.recent_messages.length >= 2, true);
  assertMessageSortedDesc(body.recent_messages);
});

test("session-dependent APIs return deterministic 404/400 for invalid IDs", async () => {
  const unknownSessionId = `sess_missing_${randomUUID()}`;
  const unknownGoalId = `rt_goal_missing_${randomUUID()}`;

  const runStepResponse = await runStepPost(
    new Request("http://localhost/api/agent/run-step", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: unknownSessionId,
        idempotency_key: "idem_seed_matrix_run_step_001"
      })
    })
  );
  assert.equal(runStepResponse.status, 404);

  const chatResponse = await chatPost(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: unknownSessionId,
        message: "pick #1"
      })
    })
  );
  assert.equal(chatResponse.status, 404);

  const reviseResponse = await revisePost(
    new Request("http://localhost/api/revise", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: unknownSessionId,
        constraint: "make it calmer"
      })
    })
  );
  assert.equal(reviseResponse.status, 404);

  const runtimeStartResponse = await runtimeStartPost(
    new Request("http://localhost/api/runtime/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: unknownSessionId,
        goal_type: "deliver_demo_pack",
        idempotency_key: "idem_seed_matrix_runtime_start_001"
      })
    })
  );
  assert.equal(runtimeStartResponse.status, 404);

  const runtimeStepResponse = await runtimeStepPost(
    new Request("http://localhost/api/runtime/step", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        goal_id: unknownGoalId,
        idempotency_key: "idem_seed_matrix_runtime_step_001"
      })
    })
  );
  assert.equal(runtimeStepResponse.status, 404);

  const sessionsMissingQuery = await sessionsGet(
    new Request("http://localhost/api/sessions")
  );
  assert.equal(sessionsMissingQuery.status, 400);

  const sessionsUnknownId = await sessionsGet(
    new Request(`http://localhost/api/sessions?session_id=${unknownSessionId}`)
  );
  assert.equal(sessionsUnknownId.status, 404);

  const sessionDetailMissing = await sessionGetById(new Request("http://localhost"), {
    params: Promise.resolve({ sessionId: unknownSessionId })
  });
  assert.equal(sessionDetailMissing.status, 404);

  const jobsUnknownSession = await jobsGet(
    new Request(`http://localhost/api/jobs?session_id=${unknownSessionId}`)
  );
  assert.equal(jobsUnknownSession.status, 404);
});
