process.env.NODE_ENV = "test";
process.env.RUNTIME_ENABLED = "true";

const test = require("node:test");
const assert = require("node:assert/strict");

const { POST: startSession } = require("../../.tmp-tests/app/api/session/start/route.js");
const { POST: runStep } = require("../../.tmp-tests/app/api/agent/run-step/route.js");
const { POST: chatRoute } = require("../../.tmp-tests/app/api/chat/route.js");
const { GET: getSession } = require("../../.tmp-tests/app/api/sessions/[sessionId]/route.js");

async function json(response) {
  return await response.json();
}

test("session start route returns initial session data", async () => {
  const request = new Request("http://localhost/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "mode_b",
      product: "AB Aurora Direction Engine For Product Teams",
      audience: "Vibe coders",
      style_keywords: ["bold", "minimal", "future"],
      auto_continue: true,
      auto_pick_top1: true
    })
  });

  const response = await startSession(request);
  assert.equal(response.status, 200);
  const body = await json(response);
  assert.ok(body.session_id);
  assert.equal(body.current_step, "interview_collect");
});

test("run-step route executes auto pipeline and stores Top-3", async () => {
  const createRequest = new Request("http://localhost/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "mode_b",
      product: "AB Aurora Direction Engine For Product Teams",
      audience: "Vibe coders",
      style_keywords: ["bold", "minimal", "future"],
      auto_continue: true,
      auto_pick_top1: true
    })
  });
  const createResponse = await startSession(createRequest);
  const sessionPayload = await json(createResponse);

  const runRequest = new Request("http://localhost/api/agent/run-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionPayload.session_id,
      idempotency_key: "idem_route_runstep_001"
    })
  });
  const runResponse = await runStep(runRequest);
  assert.equal(runResponse.status, 200);
  const runBody = await json(runResponse);
  assert.ok(Array.isArray(runBody.latest_top3));
  assert.equal(runBody.latest_top3.length, 3);
  assert.equal(runBody.runtime_meta.enabled, true);

  const sessionResponse = await getSession(new Request("http://localhost"), {
    params: Promise.resolve({ sessionId: sessionPayload.session_id })
  });
  const sessionBody = await json(sessionResponse);
  assert.equal(sessionBody.latest_top3.length, 3);
});

test("chat route parses select action and applies override", async () => {
  const createRequest = new Request("http://localhost/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "mode_b",
      product: "AB Aurora Direction Engine For Product Teams",
      audience: "Vibe coders",
      style_keywords: ["bold", "minimal", "future"],
      auto_continue: true,
      auto_pick_top1: true
    })
  });
  const createResponse = await startSession(createRequest);
  const createBody = await json(createResponse);
  await runStep(
    new Request("http://localhost/api/agent/run-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: createBody.session_id,
        idempotency_key: "idem_route_runstep_002"
      })
    })
  );

  const chatRequest = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: createBody.session_id,
      message: "2번 후보로 바꿔"
    })
  });
  const chatResponse = await chatRoute(chatRequest);
  assert.equal(chatResponse.status, 200);
  const chatBody = await json(chatResponse);
  assert.equal(chatBody.interpreted_action.type, "select_candidate");
  assert.equal(chatBody.applied, true);
  assert.equal(chatBody.runtime_meta.enabled, true);
});
