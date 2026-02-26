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
    canStartSession: true
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
    canStartSession: true
  });

  assert.equal(model.primaryAction?.id, "run_step");
  assert.equal(model.hint.includes("다음 stage"), true);
  assert.equal(model.suggestedCommand, "/tone calmer");
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
    canStartSession: false
  });

  assert.equal(model.primaryAction?.id, "start_session");
  assert.equal(model.primaryAction?.disabled, true);
  assert.equal(model.suggestedCommand, "/start");
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
    canStartSession: true
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
    canStartSession: true
  });

  assert.equal(pending.primaryAction?.id, "export_zip");
  assert.equal(pending.primaryAction?.disabled, true);
  assert.equal(pending.suggestedCommand, "/export");
  assert.equal(ready.primaryAction?.disabled, false);
});
