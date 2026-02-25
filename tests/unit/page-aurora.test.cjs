process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");

const pageModule = require("../../.tmp-tests/app/page.js");
const auroraAssets = require("../../.tmp-tests/components/aurora/aurora-assets.js");
const auroraTypes = require("../../.tmp-tests/components/aurora/types.js");

const HomePage = pageModule.default;

test("resolveSceneFromStep maps each known stage to the expected scene", () => {
  assert.equal(auroraTypes.resolveSceneFromStep("interview_collect"), "DEFINE");
  assert.equal(auroraTypes.resolveSceneFromStep("intent_gate"), "DEFINE");
  assert.equal(auroraTypes.resolveSceneFromStep("spec_draft"), "DEFINE");
  assert.equal(auroraTypes.resolveSceneFromStep("candidates_generate"), "EXPLORE");
  assert.equal(auroraTypes.resolveSceneFromStep("top3_select"), "DECIDE");
  assert.equal(auroraTypes.resolveSceneFromStep("approve_build"), "DECIDE");
  assert.equal(auroraTypes.resolveSceneFromStep("package"), "PACKAGE");
  assert.equal(auroraTypes.resolveSceneFromStep("done"), "PACKAGE");
  assert.equal(auroraTypes.resolveSceneFromStep("unknown-step"), "DEFINE");
  assert.equal(auroraTypes.resolveSceneFromStep(undefined), "DEFINE");
});

test("aurora asset helpers return deterministic card and css vars", () => {
  const card1 = auroraAssets.getTop3CardAsset(1);
  const card2 = auroraAssets.getTop3CardAsset(2);
  const card3 = auroraAssets.getTop3CardAsset(3);
  const cardFallback = auroraAssets.getTop3CardAsset(99);

  assert.equal(card1.rank, 1);
  assert.equal(card2.rank, 2);
  assert.equal(card3.rank, 3);
  assert.equal(cardFallback.rank, 1);
  assert.equal(card1.image.startsWith(`${auroraAssets.ASSET_BASE}/`), true);
  assert.equal(auroraAssets.AURORA_ASSETS.backgroundDesktop.includes("bg_abstract_orbline_1920x1080"), true);

  const style = auroraAssets.createAuroraPageStyle();
  assert.equal(typeof style["--aurora-bg-desktop"], "string");
  assert.equal(typeof style["--aurora-bg-mobile"], "string");
  assert.equal(typeof style["--aurora-sigil-tile"], "string");
});

test("home page resolves ui mode from query first", async () => {
  const element = await HomePage({
    searchParams: Promise.resolve({
      ui: "pro"
    })
  });

  assert.equal(React.isValidElement(element), true);
  assert.equal(element.props.initialUiMode, "pro");
});

test("home page defaults to guided when query ui is missing or invalid", async () => {
  const defaultGuided = await HomePage({
    searchParams: Promise.resolve({})
  });
  assert.equal(defaultGuided.props.initialUiMode, "guided");

  const invalidQuery = await HomePage({
    searchParams: Promise.resolve({
      ui: "agent_stage"
    })
  });
  assert.equal(invalidQuery.props.initialUiMode, "guided");
});
