process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const OPENAI_HEALTH_MODULE_PATH = "../../.tmp-tests/lib/ai/openai-health.js";
const ENV_MODULE_PATH = "../../.tmp-tests/lib/env.js";

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

function loadHealthModuleWithEnv(envPatch) {
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
    clearCachedModules([OPENAI_HEALTH_MODULE_PATH, ENV_MODULE_PATH]);
    return require(OPENAI_HEALTH_MODULE_PATH).runOpenAiHealthCheck;
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

function makeAbortError(message = "aborted") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

test("runOpenAiHealthCheck returns ok=true when text and image probes both pass", async () => {
  const runOpenAiHealthCheck = loadHealthModuleWithEnv({
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL_TEXT: "gpt-4o",
    OPENAI_MODEL_IMAGE: "gpt-image-1"
  });

  const calls = [];
  const imageBodies = [];
  const fetchImpl = async (url, init) => {
    const targetUrl = String(url);
    calls.push(targetUrl);
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
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (targetUrl.includes("/images/generations")) {
      imageBodies.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({
          data: [{ url: "https://example.com/health-image.png" }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("unhandled", { status: 404 });
  };

  const result = await runOpenAiHealthCheck({
    fetchImpl,
    timeoutMs: 2000,
    nowIso: () => "2026-03-14T00:00:00.000Z"
  });

  assert.equal(calls.length, 2);
  assert.equal("response_format" in imageBodies[0], false);
  assert.equal(result.ok, true);
  assert.equal(result.text.ok, true);
  assert.equal(result.image.ok, true);
  assert.equal(result.error_reason, undefined);
  assert.equal(result.checked_at, "2026-03-14T00:00:00.000Z");
  assert.equal(result.model.text, "gpt-4o");
  assert.equal(result.model.image, "gpt-image-1");
});

test("runOpenAiHealthCheck marks http probe failures with parsed reason", async () => {
  const runOpenAiHealthCheck = loadHealthModuleWithEnv({
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL_TEXT: "gpt-4o",
    OPENAI_MODEL_IMAGE: "gpt-image-1"
  });

  const fetchImpl = async (url) => {
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
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (targetUrl.includes("/images/generations")) {
      return new Response("provider error", { status: 500 });
    }
    return new Response("unhandled", { status: 404 });
  };

  const result = await runOpenAiHealthCheck({
    fetchImpl,
    timeoutMs: 2000
  });

  assert.equal(result.ok, false);
  assert.equal(result.text.ok, true);
  assert.equal(result.image.ok, false);
  assert.equal(result.image.error_reason, "http_500");
  assert.equal(result.error_reason, "image:http_500");
});

test("runOpenAiHealthCheck omits response_format for gpt-image models", async () => {
  const runOpenAiHealthCheck = loadHealthModuleWithEnv({
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL_TEXT: "gpt-4o",
    OPENAI_MODEL_IMAGE: "gpt-image-1"
  });

  const imageBodies = [];
  const fetchImpl = async (url, init) => {
    const targetUrl = String(url);
    if (targetUrl.includes("/chat/completions")) {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (targetUrl.includes("/images/generations")) {
      imageBodies.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({
          data: [{ b64_json: "ZmFrZQ==" }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("unhandled", { status: 404 });
  };

  const result = await runOpenAiHealthCheck({
    fetchImpl,
    timeoutMs: 2000
  });

  assert.equal(result.ok, true);
  assert.equal(imageBodies.length, 1);
  assert.equal("response_format" in imageBodies[0], false);
});

test("runOpenAiHealthCheck marks timeout errors as timeout", async () => {
  const runOpenAiHealthCheck = loadHealthModuleWithEnv({
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL_TEXT: "gpt-4o",
    OPENAI_MODEL_IMAGE: "gpt-image-1"
  });

  const fetchImpl = async (_url, init = {}) =>
    new Promise((_resolve, reject) => {
      const signal = init.signal;
      if (signal?.aborted) {
        reject(makeAbortError());
        return;
      }
      if (signal && typeof signal.addEventListener === "function") {
        signal.addEventListener(
          "abort",
          () => {
            reject(makeAbortError());
          },
          { once: true }
        );
      }
    });

  const result = await runOpenAiHealthCheck({
    fetchImpl,
    timeoutMs: 10
  });

  assert.equal(result.ok, false);
  assert.equal(result.text.ok, false);
  assert.equal(result.text.error_reason, "timeout");
  assert.equal(typeof result.error_reason, "string");
  assert.equal(result.error_reason.startsWith("text:"), true);
});
