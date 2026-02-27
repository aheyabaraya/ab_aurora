process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const START_SESSION_ROUTE_PATH = "../../.tmp-tests/app/api/session/start/route.js";
const REVISE_ROUTE_PATH = "../../.tmp-tests/app/api/revise/route.js";
const ENV_MODULE_PATH = "../../.tmp-tests/lib/env.js";
const AUTH_MODULE_PATH = "../../.tmp-tests/lib/auth/api-token.js";
const STORAGE_INDEX_MODULE_PATH = "../../.tmp-tests/lib/storage/index.js";
const sequential = { concurrency: false };

function clearCachedModules(modulePaths) {
  for (const modulePath of modulePaths) {
    try {
      const resolved = require.resolve(modulePath);
      delete require.cache[resolved];
    } catch {
      // Ignore if module is not cached.
    }
  }
}

function loadRevisePostWithEnv(envPatch) {
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
    clearCachedModules([REVISE_ROUTE_PATH, ENV_MODULE_PATH, AUTH_MODULE_PATH]);
    return require(REVISE_ROUTE_PATH).POST;
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

function loadStartSessionPostWithEnv(envPatch) {
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
    clearCachedModules([START_SESSION_ROUTE_PATH, STORAGE_INDEX_MODULE_PATH, ENV_MODULE_PATH, AUTH_MODULE_PATH]);
    return require(START_SESSION_ROUTE_PATH).POST;
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

async function json(response) {
  return response.json();
}

async function createSession() {
  const startSession = loadStartSessionPostWithEnv({
    NODE_ENV: "test",
    API_TOKEN_REQUIRED: "false",
    RUNTIME_ENABLED: "false"
  });
  const response = await startSession(
    new Request("http://localhost/api/session/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mode: "mode_b",
        product: "Aurora Direction Engine",
        audience: "Founders",
        style_keywords: ["editorial", "calm"],
        design_direction_note: "Keep serif hierarchy and avoid glossy gradients.",
        auto_continue: false,
        auto_pick_top1: false
      })
    })
  );
  const body = await json(response);
  assert.equal(response.status, 200, `createSession failed: ${JSON.stringify(body)}`);
  assert.ok(typeof body.session_id === "string" && body.session_id.length > 0, `missing session_id: ${JSON.stringify(body)}`);
  return body.session_id;
}

test("revise route returns 401 when API token is required and missing", sequential, async () => {
  const revisePost = loadRevisePostWithEnv({
    NODE_ENV: "production",
    API_TOKEN_REQUIRED: "true",
    API_BEARER_TOKEN: "required-token",
    RUNTIME_ENABLED: "false"
  });

  const response = await revisePost(
    new Request("http://localhost/api/revise", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: "sess_unauthorized_test",
        constraint: "calmer"
      })
    })
  );

  assert.equal(response.status, 401);
  const body = await json(response);
  assert.equal(body.error, "Unauthorized");
});

test("revise route returns 400 for invalid payload", sequential, async () => {
  const revisePost = loadRevisePostWithEnv({
    NODE_ENV: "test",
    API_TOKEN_REQUIRED: "false",
    RUNTIME_ENABLED: "false"
  });

  const response = await revisePost(
    new Request("http://localhost/api/revise", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: "",
        constraint: ""
      })
    })
  );

  assert.equal(response.status, 400);
  const body = await json(response);
  assert.equal(body.error, "Invalid revise payload");
});

test("revise route executes runtime flow when runtime is enabled", sequential, async () => {
  const sessionId = await createSession();
  const revisePost = loadRevisePostWithEnv({
    NODE_ENV: "test",
    API_TOKEN_REQUIRED: "false",
    RUNTIME_ENABLED: "true"
  });

  const response = await revisePost(
    new Request("http://localhost/api/revise", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: sessionId,
        constraint: "reduce futuristic and keep ritual calm"
      })
    })
  );

  assert.equal(response.status, 200);
  const body = await json(response);
  assert.equal(body.runtime_meta.enabled, true);
  assert.ok(typeof body.runtime_meta.goal_id === "string");
  assert.ok(["running", "completed", "wait_user"].includes(body.status));
});

test("revise route executes legacy pipeline when runtime is disabled", sequential, async () => {
  const sessionId = await createSession();
  const revisePost = loadRevisePostWithEnv({
    NODE_ENV: "test",
    API_TOKEN_REQUIRED: "false",
    RUNTIME_ENABLED: "false"
  });

  const response = await revisePost(
    new Request("http://localhost/api/revise", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: sessionId,
        constraint: "make it more editorial",
        intensity: 70
      })
    })
  );

  assert.equal(response.status, 200);
  const body = await json(response);
  assert.equal(body.runtime_meta.enabled, false);
  assert.equal(typeof body.status, "string");
  assert.ok(body.status.length > 0);
});
