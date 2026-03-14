process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AUTH_TEST_USER_ID,
  createAuthFetchMock,
  authJsonHeaders
} = require("../helpers/auth-fetch.cjs");

const OPENAI_HEALTH_ROUTE_PATH = "../../.tmp-tests/app/api/internal/openai/health/route.js";
const OPENAI_HEALTH_MODULE_PATH = "../../.tmp-tests/lib/ai/openai-health.js";
const ENV_MODULE_PATH = "../../.tmp-tests/lib/env.js";
const GUARDS_MODULE_PATH = "../../.tmp-tests/lib/auth/guards.js";
const ONBOARDING_SERVICE_PATH = "../../.tmp-tests/lib/onboarding/service.js";
const sequential = { concurrency: false };

function clearCachedModules(modulePaths) {
  for (const modulePath of modulePaths) {
    try {
      const resolved = require.resolve(modulePath);
      delete require.cache[resolved];
    } catch {
      // Ignore unresolved modules.
    }
  }
}

function loadHealthGetWithEnv(envPatch) {
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
    clearCachedModules([
      OPENAI_HEALTH_ROUTE_PATH,
      OPENAI_HEALTH_MODULE_PATH,
      ENV_MODULE_PATH,
      GUARDS_MODULE_PATH,
      ONBOARDING_SERVICE_PATH
    ]);
    return require(OPENAI_HEALTH_ROUTE_PATH).GET;
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

test("openai health route returns 200 when text/image probes both pass", sequential, async () => {
  const healthGet = loadHealthGetWithEnv({
    NODE_ENV: "test",
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL_TEXT: "gpt-4o",
    OPENAI_MODEL_IMAGE: "gpt-image-1"
  });

  global.fetch = createAuthFetchMock({
    userId: AUTH_TEST_USER_ID,
    hasAuroraAccess: true,
    onboardingComplete: true,
    delegate: async (url) => {
      const targetUrl = String(url);
      if (targetUrl.includes("/chat/completions")) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "ok"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      if (targetUrl.includes("/images/generations")) {
        return new Response(
          JSON.stringify({
            data: [{ url: "https://example.com/health-image.png" }]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      return new Response("unhandled delegate path", { status: 404 });
    }
  });

  const response = await healthGet(
    new Request("http://localhost/api/internal/openai/health", {
      method: "GET",
      headers: authJsonHeaders()
    })
  );

  assert.equal(response.status, 200);
  const body = await json(response);
  assert.equal(body.ok, true);
  assert.equal(body.text.ok, true);
  assert.equal(body.image.ok, true);
  assert.equal(body.model.text, "gpt-4o");
  assert.equal(body.model.image, "gpt-image-1");
  assert.equal(typeof body.request_id, "string");
});

test("openai health route returns 503 when one probe fails", sequential, async () => {
  const healthGet = loadHealthGetWithEnv({
    NODE_ENV: "test",
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL_TEXT: "gpt-4o",
    OPENAI_MODEL_IMAGE: "gpt-image-1"
  });

  global.fetch = createAuthFetchMock({
    userId: AUTH_TEST_USER_ID,
    hasAuroraAccess: true,
    onboardingComplete: true,
    delegate: async (url) => {
      const targetUrl = String(url);
      if (targetUrl.includes("/chat/completions")) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "ok"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      if (targetUrl.includes("/images/generations")) {
        return new Response("image provider failed", { status: 500 });
      }
      return new Response("unhandled delegate path", { status: 404 });
    }
  });

  const response = await healthGet(
    new Request("http://localhost/api/internal/openai/health", {
      method: "GET",
      headers: authJsonHeaders()
    })
  );

  assert.equal(response.status, 503);
  const body = await json(response);
  assert.equal(body.ok, false);
  assert.equal(body.text.ok, true);
  assert.equal(body.image.ok, false);
  assert.equal(typeof body.error_reason, "string");
  assert.equal(body.error_reason.startsWith("image:"), true);
});

test("openai health route returns 401 when bearer auth is missing", sequential, async () => {
  const healthGet = loadHealthGetWithEnv({
    NODE_ENV: "test",
    OPENAI_API_KEY: "test-openai-key"
  });

  global.fetch = createAuthFetchMock({
    userId: AUTH_TEST_USER_ID,
    hasAuroraAccess: true,
    onboardingComplete: true
  });

  const response = await healthGet(
    new Request("http://localhost/api/internal/openai/health", {
      method: "GET"
    })
  );

  assert.equal(response.status, 401);
  const body = await json(response);
  assert.equal(body.error, "Unauthorized");
});

test("openai health route returns 403 when entitlement is missing", sequential, async () => {
  const healthGet = loadHealthGetWithEnv({
    NODE_ENV: "test",
    OPENAI_API_KEY: "test-openai-key"
  });

  global.fetch = createAuthFetchMock({
    userId: AUTH_TEST_USER_ID,
    hasAuroraAccess: false,
    onboardingComplete: true
  });

  const response = await healthGet(
    new Request("http://localhost/api/internal/openai/health", {
      method: "GET",
      headers: authJsonHeaders()
    })
  );

  assert.equal(response.status, 403);
  const body = await json(response);
  assert.equal(body.error, "Forbidden");
});
