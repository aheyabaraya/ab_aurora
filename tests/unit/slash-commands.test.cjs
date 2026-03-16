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

test("parseSlashCommand parses setup command", () => {
  const parsed = parseSlashCommand("/setup");
  assert.equal(parsed?.id, "setup_brief");
  assert.equal(parsed?.spec.canonical, "/setup");
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

test("validateSlashCommandContext enforces session requirements", () => {
  const buildCommand = parseSlashCommand("/build");
  assert.ok(buildCommand);

  const withoutSession = validateSlashCommandContext(buildCommand.spec, {
    sessionReady: false,
    runtimeGoalReady: false
  });
  assert.equal(withoutSession, "Session is required. Run /start first.");

  const withSession = validateSlashCommandContext(buildCommand.spec, {
    sessionReady: true,
    runtimeGoalReady: false
  });
  assert.equal(withSession, null);
});

test("filterSlashCommands lists relevant slash entries", () => {
  const commands = filterSlashCommands("/", { sessionReady: true });
  assert.equal(commands.some((item) => item.id === "run_step"), true);
  assert.equal(commands.some((item) => item.id === "tone_editorial"), false);
});

test("filterSlashCommands keeps setup visible when argument prefix exists", () => {
  const commands = filterSlashCommands("/setup q0", { sessionReady: false });
  assert.equal(commands.some((item) => item.id === "setup_brief"), true);
});

test("buildSlashHelpText includes command descriptions", () => {
  const help = buildSlashHelpText({ sessionReady: true });
  assert.equal(help.includes("/pick 1"), true);
  assert.equal(help.includes("Select candidate #1."), true);
  assert.equal(help.includes("/tone editorial"), false);
});
