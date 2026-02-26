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
  rationale: "Balanced premium tone for focused builders."
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
    candidate
  });

  assert.equal(calls.length, 3);
  assert.equal(calls.every((call) => call.url.includes("/images/generations")), true);
  const requestBody = JSON.parse(calls[0].init.body);
  assert.equal(requestBody.model, "gpt-image-1");
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
    candidate
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
        candidate
      }),
    /OpenAI image call failed/
  );
});
