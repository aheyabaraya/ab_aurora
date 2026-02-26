process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getCommandExecutionMeta,
  sendChatAndSync
} = require("../../.tmp-tests/components/aurora/useAuroraController.js");

test("sendChatAndSync runs chat, refreshes runtime goal, and refreshes session", async () => {
  const calls = {
    request: [],
    setRuntimeGoal: [],
    refreshRuntimeGoal: [],
    refreshSession: []
  };

  const response = await sendChatAndSync({
    sessionId: "sess_1",
    runtimeGoalId: "goal_old",
    message: "pick 1",
    requestJson: async (url, init) => {
      calls.request.push({ url, init });
      return {
        runtime_meta: {
          goal_id: "goal_new"
        },
        assistant_source: "openai",
        rate_limited: false
      };
    },
    setRuntimeGoalId: (goalId) => calls.setRuntimeGoal.push(goalId),
    refreshRuntimeGoal: async (goalId) => {
      calls.refreshRuntimeGoal.push(goalId);
    },
    refreshSession: async (sessionId) => {
      calls.refreshSession.push(sessionId);
    }
  });

  assert.equal(calls.request.length, 1);
  assert.equal(calls.request[0].url, "/api/chat");
  assert.equal(calls.setRuntimeGoal[0], "goal_new");
  assert.equal(calls.refreshRuntimeGoal[0], "goal_new");
  assert.equal(calls.refreshSession[0], "sess_1");
  assert.equal(response.assistant_source, "openai");
});

test("sendChatAndSync uses existing runtime goal when response has no new goal", async () => {
  const calls = {
    refreshRuntimeGoal: [],
    refreshSession: []
  };

  await sendChatAndSync({
    sessionId: "sess_2",
    runtimeGoalId: "goal_existing",
    message: "continue",
    requestJson: async () => ({}),
    setRuntimeGoalId: () => {},
    refreshRuntimeGoal: async (goalId) => {
      calls.refreshRuntimeGoal.push(goalId);
    },
    refreshSession: async (sessionId) => {
      calls.refreshSession.push(sessionId);
    }
  });

  assert.equal(calls.refreshRuntimeGoal[0], "goal_existing");
  assert.equal(calls.refreshSession[0], "sess_2");
});

test("sendChatAndSync returns empty response when session is missing", async () => {
  const response = await sendChatAndSync({
    sessionId: null,
    runtimeGoalId: null,
    message: "pick 1",
    requestJson: async () => {
      throw new Error("should not be called");
    },
    setRuntimeGoalId: () => {},
    refreshRuntimeGoal: async () => {},
    refreshSession: async () => {}
  });

  assert.deepEqual(response, {});
});

test("getCommandExecutionMeta maps assistant source and rate-limited flags", () => {
  const openAiMeta = getCommandExecutionMeta({
    assistant_source: "openai",
    rate_limited: false
  });
  assert.deepEqual(openAiMeta, {
    assistantSource: "openai",
    rateLimited: false
  });

  const limitedMeta = getCommandExecutionMeta({
    assistant_source: "rate_limited",
    rate_limited: true
  });
  assert.deepEqual(limitedMeta, {
    assistantSource: "rate_limited",
    rateLimited: true
  });

  const emptyMeta = getCommandExecutionMeta(null);
  assert.deepEqual(emptyMeta, {
    assistantSource: undefined,
    rateLimited: undefined
  });
});
