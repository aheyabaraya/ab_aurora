const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";

const OPENAI_MODULE_PATH = "../../.tmp-tests/lib/ai/openai.js";
const ENV_MODULE_PATH = "../../.tmp-tests/lib/env.js";

function clearCachedModules(modulePaths) {
  for (const modulePath of modulePaths) {
    try {
      const resolved = require.resolve(modulePath);
      delete require.cache[resolved];
    } catch {
      // Ignore unresolved module paths.
    }
  }
}

function loadGenerateSocialAssetsWithFallback(envPatch) {
  const saved = {};
  for (const [key, value] of Object.entries(envPatch)) {
    saved[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    clearCachedModules([OPENAI_MODULE_PATH, ENV_MODULE_PATH]);
    return require(OPENAI_MODULE_PATH).generateSocialAssetsWithFallback;
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function loadOpenAiHelpers(envPatch) {
  const saved = {};
  for (const [key, value] of Object.entries(envPatch)) {
    saved[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    clearCachedModules([OPENAI_MODULE_PATH, ENV_MODULE_PATH]);
    const mod = require(OPENAI_MODULE_PATH);
    return {
      generateBuildSocialAssets: mod.generateBuildSocialAssets,
      generateSocialAssetsWithFallback: mod.generateSocialAssetsWithFallback,
      generateCandidatesWithFallback: mod.generateCandidatesWithFallback
    };
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const candidate = {
  id: "cand_1",
  rank: 1,
  score: 0.9,
  naming: {
    recommended: "Astra",
    candidates: ["Astra"]
  },
  moodboard: {
    title: "Orbital calm",
    prompt: "deep navy with calm cyan accents",
    colors: ["#0a1022", "#0d1f3d", "#5ed6e5"]
  },
  ui_plan: {
    headline: "Build in calm momentum",
    layout: ["hero", "proof", "cta"],
    cta: "Start now"
  },
  rationale: "Balanced premium tone for focused builders.",
  narrative_summary: "A calm premium route with one clear focal subject and controlled atmosphere.",
  image_prompt: "Primary scene for Astra with calm confidence and spatial depth.",
  supporting_assets: [],
  story: {
    premise: "Astra frames the brand with clear momentum.",
    narrative: "Astra moves through one clear focal scene supported by environment and detail.",
    asset_rationale: "Support the hero with simple atmospheric cues."
  }
};

const direction = {
  brief_summary: "AB Aurora shapes a premium founder-facing brand world.",
  brand_promise: "Translate conviction into a distinct visual direction.",
  audience_tension: "Solo founders need clarity without generic SaaS sameness.",
  narrative_summary: "A calm, focused brand world with one clear focal subject and cultural depth.",
  voice_principles: ["Clear and concrete", "Calm but decisive"],
  anti_goals: ["generic AI moodboards", "empty abstract gradients", "noisy sci-fi clutter"],
  visual_principles: ["clear focal hierarchy", "restrained glow", "cinematic spatial depth"],
  image_intent: "Create one finished hero image with a readable focal subject, grounded depth, and premium restraint.",
  prompt_seed:
    "premium founder-facing hero scene | calm confidence | cultural depth | clear focal subject | restrained glow",
  hero_subject: "Lead with the environment and spatial scene as the primary subject.",
  people_directive: "People are optional. If a person appears, keep them secondary to the scene.",
  next_question: "What should the first asset emphasize most?",
  asset_intent: {
    focus: "background",
    rationale: "Lead with a spatial scene, then support it with prop and portrait cues.",
    priority_order: ["background", "prop", "portrait"],
    default_bundle: "background + prop + portrait",
    defaults_applied: true,
    question: "Should the first asset emphasize environment, object detail, or a human subject?"
  },
  clarity: {
    score: 4,
    ready_for_concepts: true,
    summary: "Ready for concept generation.",
    missing_inputs: [],
    followup_questions: []
  }
};

test("generateSocialAssetsWithFallback uses OpenAI image model when key exists", async () => {
  const generateSocialAssetsWithFallback = loadGenerateSocialAssetsWithFallback({
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL_IMAGE: "gpt-image-1",
    OPENAI_FALLBACK_MODE: "deterministic_mock"
  });

  const calls = [];
  global.fetch = async (_url, init) => {
    calls.push({ url: String(_url), init });
    return new Response(
      JSON.stringify({
        data: [
          {
            url: "https://example.com/generated-image.png"
          }
        ]
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  };

  const assets = await generateSocialAssetsWithFallback({
    sessionId: "sess_social_openai",
    candidate,
    product: "AB Aurora",
    audience: "Solo founders",
    direction
  });

  assert.equal(calls.length, 3);
  assert.equal(calls.every((call) => call.url.includes("/images/generations")), true);
  const requestBody = JSON.parse(calls[0].init.body);
  assert.equal(requestBody.model, "gpt-image-1");
  assert.equal("response_format" in requestBody, false);
  assert.match(requestBody.prompt, /Direction image intent:/i);
  assert.match(requestBody.prompt, /Direction prompt seed:/i);
  assert.match(requestBody.prompt, /Primary scene:/i);
  assert.match(requestBody.prompt, /Render one finished image rather than a moodboard/i);
  assert.equal(assets.source, "openai");
  assert.equal(assets.model, "gpt-image-1");
  assert.equal(assets.post_1200x675.startsWith("https://"), true);
});

test("generateSocialAssetsWithFallback returns mock assets when key is missing", async () => {
  const generateSocialAssetsWithFallback = loadGenerateSocialAssetsWithFallback({
    OPENAI_API_KEY: undefined,
    OPENAI_MODEL_IMAGE: "gpt-image-1",
    OPENAI_FALLBACK_MODE: "deterministic_mock"
  });
  global.fetch = async () => {
    throw new Error("fetch must not be called without key");
  };

  const assets = await generateSocialAssetsWithFallback({
    sessionId: "sess_social_mock",
    candidate,
    product: "AB Aurora",
    audience: "Solo founders",
    direction
  });
  assert.equal(assets.source, "mock");
  assert.equal(assets.post_1200x675.startsWith("generated://"), true);
});

test("generateSocialAssetsWithFallback throws when fallback mode is none", async () => {
  const generateSocialAssetsWithFallback = loadGenerateSocialAssetsWithFallback({
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL_IMAGE: "gpt-image-1",
    OPENAI_FALLBACK_MODE: "none"
  });
  global.fetch = async () => new Response("image provider error", { status: 500 });

  await assert.rejects(
    () =>
      generateSocialAssetsWithFallback({
        sessionId: "sess_social_fail",
        candidate,
        product: "AB Aurora",
        audience: "Solo founders",
        direction
      }),
    /OpenAI image call failed/
  );
});

test("generateBuildSocialAssets falls back to mock assets when build renders fail", async () => {
  const { generateBuildSocialAssets } = loadOpenAiHelpers({
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL_IMAGE: "gpt-image-1",
    OPENAI_FALLBACK_MODE: "none"
  });

  global.fetch = async () => new Response("image provider error", { status: 500 });

  const assets = await generateBuildSocialAssets({
    sessionId: "sess_build_soft_fallback",
    candidate,
    product: "AB Aurora",
    audience: "Solo founders",
    direction
  });

  assert.equal(assets.source, "mock");
  assert.equal(assets.post_1200x675.startsWith("generated://"), true);
});

test("generateCandidatesWithFallback keeps three candidates when one image render fails", async () => {
  const { generateCandidatesWithFallback } = loadOpenAiHelpers({
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL_TEXT: "gpt-4o",
    OPENAI_MODEL_IMAGE: "gpt-image-1",
    OPENAI_FALLBACK_MODE: "none",
    TOP_K: "3"
  });

  const logged = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
    logged.push(args);
  };

  let imageCallCount = 0;
  const imagePrompts = [];
  global.fetch = async (_url, init) => {
    const url = String(_url);
    if (url.includes("/chat/completions")) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  candidates: [
                    {
                      naming: { recommended: "Astra", candidates: ["Astra", "Aster", "Astra Nova"] },
                      moodboard: { title: "Orbital calm", prompt: "deep navy with calm cyan glow", colors: ["#0a1022", "#0d1f3d", "#5ed6e5"] },
                      ui_plan: { headline: "Build in calm momentum", layout: ["hero", "proof", "cta"], cta: "Start now" },
                      rationale: "Balanced premium tone for focused builders.",
                      narrative_summary: "A calm premium direction with a clear orbiting focal point.",
                      image_prompt: "candidate image prompt 1"
                    },
                    {
                      naming: { recommended: "Halo", candidates: ["Halo", "Halcyon", "Halo Arc"] },
                      moodboard: { title: "Luminous restraint", prompt: "violet dusk with restrained light", colors: ["#160f2d", "#4d3f9f", "#e6ddff"] },
                      ui_plan: { headline: "Shape direction without noise", layout: ["hero", "grid", "cta"], cta: "Continue" },
                      rationale: "A tighter editorial route with softer contrast.",
                      narrative_summary: "An editorial route that feels focused and ceremonial.",
                      image_prompt: "candidate image prompt 2"
                    },
                    {
                      naming: { recommended: "Morrow", candidates: ["Morrow", "Morrow Line", "Morrow Studio"] },
                      moodboard: { title: "Bright ritual", prompt: "golden ritual light with deep indigo base", colors: ["#0c1024", "#365bff", "#f0c66c"] },
                      ui_plan: { headline: "Give the project a stronger point of view", layout: ["split-hero", "metrics", "cta"], cta: "Generate" },
                      rationale: "Pushes stronger contrast while staying premium.",
                      narrative_summary: "A brighter ritual direction built around high-contrast focus.",
                      image_prompt: "candidate image prompt 3"
                    }
                  ]
                })
              }
            }
          ],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 80,
            total_tokens: 200
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (url.includes("/images/generations")) {
      imageCallCount += 1;
      imagePrompts.push(JSON.parse(init.body).prompt);
      if (imageCallCount === 2) {
        return new Response("provider temporary failure", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          data: [{ b64_json: "ZmFrZS1pbWFnZQ==" }]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const generated = await generateCandidatesWithFallback({
      sessionId: "sess_partial_render",
      product: "Aurora Direction",
      audience: "Solo founders",
      styleKeywords: ["calm", "editorial", "ritual"],
      intentConfidence: 4,
      direction: {
        brief_summary: "A concise direction.",
        brand_promise: "Promise",
        audience_tension: "Tension",
        narrative_summary: "Narrative",
        voice_principles: ["Clear", "Focused"],
        anti_goals: ["Generic", "Noisy"],
        visual_principles: ["Contrast", "Glow", "Hierarchy"],
        image_intent: "A single hero scene",
        prompt_seed: "calm editorial ritual",
        hero_subject: "Lead with one clear spatial scene as the primary subject.",
        people_directive: "People are optional. Keep the image grounded in the environment first.",
        next_question: "What should Aurora explore first?",
        asset_intent: {
          focus: "background",
          rationale: "Lead with environment first.",
          priority_order: ["background", "prop", "portrait"],
          default_bundle: "background + prop + portrait",
          defaults_applied: true,
          question: "What should Aurora emphasize first?"
        },
        clarity: {
          score: 4,
          ready_for_concepts: true,
          summary: "Ready",
          missing_inputs: [],
          followup_questions: []
        }
      }
    });

    assert.equal(generated.candidates.length, 3);
    assert.equal(generated.source, "openai");
    assert.equal(generated.render_failures.length, 1);
    assert.equal(generated.render_failures[0].candidate_id, "cand_2");
    assert.equal(generated.candidates[0].supporting_assets.length, 3);
    assert.equal(typeof generated.candidates[0].story.premise, "string");
    assert.equal(generated.usage.image_generations, 12);
    assert.equal(generated.candidates[0].image_url.startsWith("data:image/png;base64,"), true);
    assert.equal(generated.candidates[1].image_url.startsWith("data:image/svg+xml"), true);
    assert.equal(generated.candidates[2].image_url.startsWith("data:image/png;base64,"), true);
    assert.equal(imagePrompts.some((prompt) => /Direction brief:/i.test(prompt)), true);
    assert.equal(imagePrompts.some((prompt) => /Prompt seed:/i.test(prompt)), true);
    assert.equal(imagePrompts.some((prompt) => /Render a single finished image, not a moodboard/i.test(prompt)), true);
    assert.equal(logged.some((entry) => String(entry[0]).includes("[openai.image.failed]")), true);
    assert.equal(logged.some((entry) => String(entry[0]).includes("[openai.candidates.image_fallback]")), true);
  } finally {
    console.error = originalConsoleError;
  }
});
