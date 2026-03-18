process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveGuidedActionViewModel } = require("../../.tmp-tests/components/aurora/guided-actions.js");

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
    shouldQueueIntervention: false,
    canStartSession: true,
    defineReadyForConcepts: true,
    defineFollowupQuestion: null
  });

  assert.equal(model.primaryAction?.id, "confirm_build");
  assert.equal(model.secondaryAction?.id, "regenerate_top3");
  assert.equal(model.suggestedCommand, "/build");
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
    shouldQueueIntervention: true,
    canStartSession: true,
    defineReadyForConcepts: false,
    defineFollowupQuestion: "Who is the highest-priority audience for this first brand direction?"
  });

  assert.equal(model.primaryAction, null);
  assert.equal(model.hint.includes("one clearer answer"), true);
  assert.equal(model.suggestedCommand, "/help");
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
    shouldQueueIntervention: false,
    canStartSession: false,
    defineReadyForConcepts: false,
    defineFollowupQuestion: null
  });

  assert.equal(model.primaryAction?.id, "start_session");
  assert.equal(model.primaryAction?.disabled, true);
  assert.equal(model.suggestedCommand, "/setup note keep serif headline hierarchy");
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
    shouldQueueIntervention: false,
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
    shouldQueueIntervention: false,
    canStartSession: true,
    defineReadyForConcepts: true,
    defineFollowupQuestion: null
  });

  assert.equal(pending.primaryAction?.id, "export_zip");
  assert.equal(pending.primaryAction?.disabled, true);
  assert.equal(pending.suggestedCommand, "/export");
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
    shouldQueueIntervention: false,
    canStartSession: true,
    defineReadyForConcepts: true,
    defineFollowupQuestion: null
  });

  assert.equal(model.primaryAction, null);
  assert.equal(model.secondaryAction?.id, "regenerate_top3");
  assert.equal(model.suggestedCommand, "/pick 1");
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
    shouldQueueIntervention: false,
    canStartSession: true,
    defineReadyForConcepts: true,
    defineFollowupQuestion: null
  });

  assert.equal(model.primaryAction, null);
  assert.equal(model.secondaryAction, null);
  assert.equal(model.suggestedCommand, "/pick 1");
  assert.equal(model.hint.includes("Build"), true);
});
