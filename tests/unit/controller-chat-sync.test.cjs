process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPostChatGuide,
  classifyChatGuidanceIntent,
  inferChatSceneTransition,
  getCommandExecutionMeta,
  resolveStructuredChatCommandId,
  resolveRunStepDecision,
  sendChatAndSync
} = require("../../.tmp-tests/components/aurora/useAuroraController.js");
const { resolveStageActivity } = require("../../.tmp-tests/components/aurora/stage-activity.js");

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

test("resolveStructuredChatCommandId recognizes guided chat commands", () => {
  assert.equal(resolveStructuredChatCommandId("pick 1"), "pick_1");
  assert.equal(resolveStructuredChatCommandId("  PICK   2 "), "pick_2");
  assert.equal(resolveStructuredChatCommandId("rerun candidates"), "regenerate_top3");
  assert.equal(resolveStructuredChatCommandId("make it calmer"), null);
});

test("inferChatSceneTransition mirrors structured chat flow transitions", () => {
  assert.deepEqual(inferChatSceneTransition("pick 3"), {
    scene: "DECIDE",
    stage: "approve_build",
    message: "Locking the selected direction and preparing build approval."
  });
  assert.deepEqual(inferChatSceneTransition("rerun candidates"), {
    scene: "EXPLORE",
    stage: "candidates_generate",
    message: "Generating 3 concept bundles from the current direction."
  });
  assert.equal(inferChatSceneTransition("freeform feedback"), null);
});

test("classifyChatGuidanceIntent separates question, approval, blocked, and revision inputs", () => {
  assert.equal(classifyChatGuidanceIntent("Why is this still in DEFINE?"), "question");
  assert.equal(classifyChatGuidanceIntent("좋아, 넘어가자"), "approval");
  assert.equal(classifyChatGuidanceIntent("왜 안 넘어가? 막혔어"), "blocked");
  assert.equal(classifyChatGuidanceIntent("톤을 더 차분하게 바꿔줘"), "revision");
});

test("buildPostChatGuide adapts next-step copy to the user's message intent", () => {
  assert.equal(
    buildPostChatGuide("brand_narrative", "좋아, 넘어가자"),
    "Approval noted. Next: click Generate 3 Concepts when you are ready to move into EXPLORE."
  );
  assert.equal(
    buildPostChatGuide("approve_build", "왜 아직 안 넘어가?"),
    "Block noted. Next: either switch routes or send one more refinement before building final outputs."
  );
  assert.equal(
    buildPostChatGuide("top3_select", "tone을 더 차분하게 바꿔줘"),
    "Revision steer sent. Next: Aurora will adjust the concept field. Compare the updated bundles, then choose one route."
  );
});

test("stale running define state allows generate after refresh path", () => {
  const payload = {
    session: {
      current_step: "brand_narrative",
      status: "running",
      draft_spec: {
        direction: {
          clarity: {
            ready_for_concepts: true,
            summary: "Direction is clear enough.",
            missing_inputs: [],
            followup_questions: [],
            score: 5
          }
        }
      }
    },
    latest_top3: [],
    selected_candidate_id: null
  };

  const staleActivity = resolveStageActivity({
    sessionPayload: payload,
    jobsPayload: { jobs: [] }
  });
  const staleDecision = resolveRunStepDecision(payload, staleActivity);
  assert.equal(staleDecision.kind, "blocked");
  assert.equal(staleDecision.needsRefresh, true);

  const refreshedActivity = resolveStageActivity({
    sessionPayload: {
      ...payload,
      session: {
        ...payload.session,
        status: "wait_user"
      }
    },
    jobsPayload: { jobs: [] }
  });
  const refreshedDecision = resolveRunStepDecision(
    {
      ...payload,
      session: {
        ...payload.session,
        status: "wait_user"
      }
    },
    refreshedActivity
  );
  assert.equal(refreshedDecision.kind, "ready");
  assert.equal(refreshedDecision.body.step, "candidates_generate");
});

test("active jobs block run-step with stage-specific copy", () => {
  const candidatesPayload = {
    session: {
      current_step: "brand_narrative",
      status: "wait_user",
      draft_spec: {
        direction: {
          clarity: {
            ready_for_concepts: true,
            summary: "Direction is clear enough.",
            missing_inputs: [],
            followup_questions: [],
            score: 5
          }
        }
      }
    },
    latest_top3: [],
    selected_candidate_id: null
  };

  const candidatesActivity = resolveStageActivity({
    sessionPayload: candidatesPayload,
    jobsPayload: {
      jobs: [{ id: "job_1", step: "candidates_generate", status: "running", error: null, created_at: new Date().toISOString() }]
    }
  });
  const candidatesDecision = resolveRunStepDecision(candidatesPayload, candidatesActivity);
  assert.equal(candidatesDecision.kind, "blocked");
  assert.equal(candidatesDecision.message.includes("3 concept bundles"), true);

  const buildPayload = {
    session: {
      current_step: "approve_build",
      status: "wait_user",
      draft_spec: {
        direction: {
          clarity: {
            ready_for_concepts: true,
            summary: "Direction is clear enough.",
            missing_inputs: [],
            followup_questions: [],
            score: 5
          }
        }
      }
    },
    latest_top3: [{ id: "cand_1" }],
    selected_candidate_id: "cand_1"
  };
  const buildActivity = resolveStageActivity({
    sessionPayload: buildPayload,
    jobsPayload: {
      jobs: [{ id: "job_2", step: "approve_build", status: "running", error: null, created_at: new Date().toISOString() }]
    }
  });
  const buildDecision = resolveRunStepDecision(buildPayload, buildActivity);
  assert.equal(buildDecision.kind, "blocked");
  assert.equal(buildDecision.message.includes("building the final outputs"), true);
});
