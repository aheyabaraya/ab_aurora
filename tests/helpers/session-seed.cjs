const DEV_SEED_ROUTE_PATH = "../../.tmp-tests/app/api/dev/seed/session/route.js";
const ENV_MODULE_PATH = "../../.tmp-tests/lib/env.js";
const STORAGE_INDEX_PATH = "../../.tmp-tests/lib/storage/index.js";

function restoreEnv(saved) {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearCachedModules(modulePaths) {
  for (const modulePath of modulePaths) {
    try {
      const resolved = require.resolve(modulePath);
      delete require.cache[resolved];
    } catch {
      // Ignore if module was not loaded yet.
    }
  }
}

function loadDevSeedPostWithEnv(envPatch = {}) {
  const saved = {};
  for (const [key, value] of Object.entries(envPatch)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }

  clearCachedModules([DEV_SEED_ROUTE_PATH, STORAGE_INDEX_PATH, ENV_MODULE_PATH]);
  const post = require(DEV_SEED_ROUTE_PATH).POST;
  restoreEnv(saved);
  return post;
}

async function seedSessionViaApi(input = {}) {
  const post = input.post ?? require(DEV_SEED_ROUTE_PATH).POST;
  const preset = input.preset ?? "fresh";
  const token = input.token ?? process.env.DEV_SEED_TOKEN ?? "seed-test-token";
  const body = {
    preset,
    ...(input.body ?? {})
  };

  const response = await post(
    new Request("http://localhost/api/dev/seed/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-seed-token": token
      },
      body: JSON.stringify(body)
    })
  );
  const payload = await response.json();
  return {
    response,
    body: payload
  };
}

async function seedSessionDirect(input) {
  const { buildSessionSeed } = require("../../.tmp-tests/lib/testing/session-seed.js");
  return buildSessionSeed(input);
}

module.exports = {
  loadDevSeedPostWithEnv,
  seedSessionViaApi,
  seedSessionDirect
};
