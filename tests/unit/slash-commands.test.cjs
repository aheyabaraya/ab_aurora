process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSlashHelpText,
  filterSlashCommands,
  parseSlashCommand,
  validateSlashCommandContext
} = require("../../.tmp-tests/components/aurora/slash-commands.js");

test("parseSlashCommand parses canonical english commands", () => {
  const parsed = parseSlashCommand("/run");
  assert.equal(parsed?.id, "run_step");
  assert.equal(parsed?.spec.canonical, "/run");
});

test("parseSlashCommand parses korean aliases", () => {
  const parsed = parseSlashCommand("/빌드");
  assert.equal(parsed?.id, "confirm_build");
});

test("parseSlashCommand parses parameterized pick command", () => {
  const parsed = parseSlashCommand("/pick 2");
  assert.equal(parsed?.id, "pick_2");
});

test("parseSlashCommand returns null for unknown command", () => {
  const parsed = parseSlashCommand("/unknown");
  assert.equal(parsed, null);
});

test("validateSlashCommandContext enforces session/runtime requirements", () => {
  const runtimeStep = parseSlashCommand("/runtime step");
  assert.ok(runtimeStep);

  const withoutSession = validateSlashCommandContext(runtimeStep.spec, {
    sessionReady: false,
    runtimeGoalReady: false
  });
  assert.equal(withoutSession, "Session is required. Run /start first.");

  const withoutGoal = validateSlashCommandContext(runtimeStep.spec, {
    sessionReady: true,
    runtimeGoalReady: false
  });
  assert.equal(withoutGoal, "Runtime goal is required. Run /runtime start first.");

  const allowed = validateSlashCommandContext(runtimeStep.spec, {
    sessionReady: true,
    runtimeGoalReady: true
  });
  assert.equal(allowed, null);
});

test("filterSlashCommands lists relevant slash entries", () => {
  const commands = filterSlashCommands("/to");
  assert.equal(commands.some((item) => item.id === "tone_editorial"), true);
});

test("buildSlashHelpText includes command descriptions", () => {
  const help = buildSlashHelpText();
  assert.equal(help.includes("/pick 1"), true);
  assert.equal(help.includes("Select candidate #1."), true);
});
