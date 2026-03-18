process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveGuidedActionViewModel } = require("../../.tmp-tests/components/aurora/guided-actions.js");

const idleActivity = {
  state: "idle",
  canRun: true,
  shouldQueue: false,
  activeStep: null,
  message: "",
  needsRefresh: false
};

test("build confirmation state pins Build as primary action", () => {
  const model = resolveGuidedActionViewModel({
    sessionId: "sess_1",
    status: "wait_user",
    currentScene: "DECIDE",
    currentStep: "approve_build",
    top3Count: 3,
    selectedCandidateId: "cand_1",
    buildConfirmRequired: true,
    runtimeGoalId: "goal_1",
    packReady: false,
    stageActivity: idleActivity,
    canStartSession: true,
    defineReadyForConcepts: true,
    defineFollowupQuestion: null
  });

  assert.equal(model.primaryAction?.id, "confirm_build");
  assert.equal(model.secondaryAction?.id, "regenerate_top3");
  assert.equal(model.suggestedCommand, "Build final outputs");
});

test("running define with active job shows queue hint", () => {
  const model = resolveGuidedActionViewModel({
    sessionId: "sess_1",
    status: "running",
    currentScene: "DEFINE",
    currentStep: "spec_draft",
    top3Count: 0,
    selectedCandidateId: null,
    buildConfirmRequired: false,
    runtimeGoalId: null,
    packReady: false,
    stageActivity: {
      state: "active",
      canRun: false,
      shouldQueue: true,
      activeStep: "spec_draft",
      message: "Aurora is drafting the working direction for this brief.",
      needsRefresh: false
    },
    canStartSession: true,
    defineReadyForConcepts: false,
    defineFollowupQuestion: "Who is the highest-priority audience for this first brand direction?"
  });

  assert.equal(model.primaryAction, null);
  assert.equal(model.hint.includes("one clearer answer"), true);
  assert.equal(model.suggestedCommand, "Answer the current brief question");
});

test("start session is disabled when setup input is invalid", () => {
  const model = resolveGuidedActionViewModel({
    sessionId: null,
    status: "idle",
    currentScene: "DEFINE",
    currentStep: "interview_collect",
    top3Count: 0,
    selectedCandidateId: null,
    buildConfirmRequired: false,
    runtimeGoalId: null,
    packReady: false,
    stageActivity: idleActivity,
    canStartSession: false,
    defineReadyForConcepts: false,
    defineFollowupQuestion: null
  });

  assert.equal(model.primaryAction?.id, "start_session");
  assert.equal(model.primaryAction?.disabled, true);
  assert.equal(model.suggestedCommand, "Complete the setup checklist");
});

test("package scene sets export as primary and disables until pack is ready", () => {
  const pending = resolveGuidedActionViewModel({
    sessionId: "sess_1",
    status: "running",
    currentScene: "PACKAGE",
    currentStep: "package",
    top3Count: 3,
    selectedCandidateId: "cand_1",
    buildConfirmRequired: false,
    runtimeGoalId: "goal_1",
    packReady: false,
    stageActivity: idleActivity,
    canStartSession: true,
    defineReadyForConcepts: true,
    defineFollowupQuestion: null
  });
  const ready = resolveGuidedActionViewModel({
    sessionId: "sess_1",
    status: "completed",
    currentScene: "PACKAGE",
    currentStep: "done",
    top3Count: 3,
    selectedCandidateId: "cand_1",
    buildConfirmRequired: false,
    runtimeGoalId: "goal_1",
    packReady: true,
    stageActivity: idleActivity,
    canStartSession: true,
    defineReadyForConcepts: true,
    defineFollowupQuestion: null
  });

  assert.equal(pending.primaryAction?.id, "export_zip");
  assert.equal(pending.primaryAction?.disabled, true);
  assert.equal(pending.suggestedCommand, "Export the pack");
  assert.equal(ready.primaryAction?.disabled, false);
});

test("explore selection state points user to pick instead of continuing run", () => {
  const model = resolveGuidedActionViewModel({
    sessionId: "sess_1",
    status: "wait_user",
    currentScene: "EXPLORE",
    currentStep: "top3_select",
    top3Count: 3,
    selectedCandidateId: null,
    buildConfirmRequired: false,
    runtimeGoalId: null,
    packReady: false,
    stageActivity: idleActivity,
    canStartSession: true,
    defineReadyForConcepts: true,
    defineFollowupQuestion: null
  });

  assert.equal(model.primaryAction, null);
  assert.equal(model.secondaryAction?.id, "regenerate_top3");
  assert.equal(model.suggestedCommand, "Choose one concept");
});

test("decide scene without locked selection does not expose Build prematurely", () => {
  const model = resolveGuidedActionViewModel({
    sessionId: "sess_1",
    status: "wait_user",
    currentScene: "DECIDE",
    currentStep: "approve_build",
    top3Count: 3,
    selectedCandidateId: null,
    buildConfirmRequired: false,
    runtimeGoalId: null,
    packReady: false,
    stageActivity: idleActivity,
    canStartSession: true,
    defineReadyForConcepts: true,
    defineFollowupQuestion: null
  });

  assert.equal(model.primaryAction, null);
  assert.equal(model.secondaryAction, null);
  assert.equal(model.suggestedCommand, "Choose one concept");
  assert.equal(model.hint.includes("Build"), true);
});

test("define ready state surfaces refresh guidance when running is stale", () => {
  const model = resolveGuidedActionViewModel({
    sessionId: "sess_1",
    status: "running",
    currentScene: "DEFINE",
    currentStep: "brand_narrative",
    top3Count: 0,
    selectedCandidateId: null,
    buildConfirmRequired: false,
    runtimeGoalId: null,
    packReady: false,
    stageActivity: {
      state: "stale_running",
      canRun: false,
      shouldQueue: false,
      activeStep: "brand_narrative",
      message: "Aurora is re-syncing this stage. One refresh check will run before the next action.",
      needsRefresh: true
    },
    canStartSession: true,
    defineReadyForConcepts: true,
    defineFollowupQuestion: null
  });

  assert.equal(model.suggestedCommand, "Wait for the refresh check");
  assert.equal(model.hint.includes("re-syncing"), true);
});
