process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const { DefineScene } = require("../../.tmp-tests/components/aurora/scenes/DefineScene.js");

function countLabel(markup, label) {
  return (markup.match(new RegExp(label, "g")) ?? []).length;
}

test("define scene keeps next action, quick, at a glance, and current focus in the first fold", () => {
  const markup = renderToStaticMarkup(
    React.createElement(DefineScene, {
      stage: "brand_narrative",
      busy: false,
      direction: {
        brief_summary: "Dark fantasy brand hero image featuring a beautiful woman in hanbok for AI artists.",
        brand_promise: "Mystique and elegance through culturally grounded fantasy fashion.",
        audience_tension: "AI artists want culturally rich fantasy imagery that still feels refined.",
        narrative_summary: "Keep the heroine central, cinematic, and ceremonial.",
        voice_principles: ["refined", "mysterious"],
        anti_goals: ["cheap horror"],
        visual_principles: ["cinematic", "cultural detail"],
        image_intent: "Medium portrait with ceremonial atmosphere and strong focal clarity.",
        prompt_seed: "Dark fantasy heroine in hanbok, elegant, atmospheric, cinematic.",
        next_question: "Should the mood lean more regal or more dangerous?",
        asset_intent: {
          focus: "portrait",
          rationale: "A focused hero image will establish the strongest first concept set.",
          priority_order: ["portrait", "background", "prop"],
          default_bundle: "portrait focus",
          defaults_applied: false,
          question: "What should Aurora emphasize first in the hero image?"
        },
        clarity: {
          score: 5,
          ready_for_concepts: true,
          summary: "The brief is clear enough to move into concept generation.",
          missing_inputs: [],
          followup_questions: []
        }
      },
      brief: {
        product: "Dark fantasy brand hero image",
        audience: "AI artists",
        firstDeliverable: "Hero image",
        styleKeywords: ["dark fantasy", "cinematic"],
        constraint: "Feature a beautiful woman in Korean hanbok.",
        q0IntentConfidence: 4
      },
      autoAdvance: {
        enabled: true,
        waiting: false,
        secondsRemaining: 42,
        onGenerate: () => {},
        onWait: () => {},
        onResume: () => {}
      }
    })
  );

  assert.equal(markup.includes("Next Action"), true);
  assert.equal(markup.includes("Quick"), true);
  assert.equal(markup.includes("At A Glance"), true);
  assert.equal(markup.includes("Current Focus"), true);
  assert.equal(countLabel(markup, "At A Glance"), 1);
  assert.equal(countLabel(markup, "Current Focus"), 1);
});
