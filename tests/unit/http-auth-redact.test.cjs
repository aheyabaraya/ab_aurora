process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const { tmpdir } = require("node:os");
const { z } = require("zod");

const HTTP_MODULE_PATH = "../../.tmp-tests/lib/api/http.js";
const AUTH_MODULE_PATH = "../../.tmp-tests/lib/auth/api-token.js";
const ENV_MODULE_PATH = "../../.tmp-tests/lib/env.js";
const REDACT_MODULE_PATH = "../../.tmp-tests/lib/security/redact.js";
const FILE_STORAGE_MODULE_PATH = "../../.tmp-tests/lib/storage/file.js";
const STORAGE_INDEX_MODULE_PATH = "../../.tmp-tests/lib/storage/index.js";

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

function withEnvPatch(envPatch, loader) {
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
    return loader();
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

function loadAssertApiTokenWithEnv(envPatch) {
  return withEnvPatch(envPatch, () => {
    clearCachedModules([AUTH_MODULE_PATH, ENV_MODULE_PATH]);
    return require(AUTH_MODULE_PATH).assertApiToken;
  });
}

test("http helpers map validation/not-found/internal errors to expected responses", async () => {
  const { jsonRouteError, getRequestId, jsonError } = require(HTTP_MODULE_PATH);

  const zodResult = z.object({ session_id: z.string().min(1) }).safeParse({ session_id: 42 });
  assert.equal(zodResult.success, false);

  const zodResponse = jsonRouteError(zodResult.error, {
    requestId: "req_zod",
    context: "unit.http"
  });
  assert.equal(zodResponse.status, 400);
  const zodBody = await zodResponse.json();
  assert.equal(zodBody.error, "Invalid request payload");
  assert.equal(zodBody.request_id, "req_zod");

  const syntaxResponse = jsonRouteError(new SyntaxError("bad json"), {
    requestId: "req_syntax",
    context: "unit.http",
    validationMessage: "Custom validation"
  });
  assert.equal(syntaxResponse.status, 400);
  const syntaxBody = await syntaxResponse.json();
  assert.equal(syntaxBody.error, "Custom validation");

  const notFoundResponse = jsonRouteError(new Error("Session not found for update"), {
    requestId: "req_404",
    context: "unit.http"
  });
  assert.equal(notFoundResponse.status, 404);
  const notFoundBody = await notFoundResponse.json();
  assert.equal(notFoundBody.error, "Resource not found");

  const internalResponse = jsonRouteError(new Error("unexpected"), {
    requestId: "req_500",
    context: "unit.http"
  });
  assert.equal(internalResponse.status, 500);
  const internalBody = await internalResponse.json();
  assert.equal(internalBody.error, "Internal server error");
  assert.equal(internalBody.request_id, "req_500");

  assert.equal(getRequestId(new Headers({ "x-request-id": "trace_001" })), "trace_001");
  assert.equal(typeof getRequestId(new Headers()), "string");

  const unauthorized = jsonError("Unauthorized", 401, "req_auth");
  assert.equal(unauthorized.status, 401);
  const unauthorizedBody = await unauthorized.json();
  assert.equal(unauthorizedBody.error, "Unauthorized");
  assert.equal(unauthorizedBody.request_id, "req_auth");

  const storageConfigResponse = jsonRouteError(
    new Error("Storage backend not configured for production. missing durable storage."),
    {
      requestId: "req_503",
      context: "unit.http"
    }
  );
  assert.equal(storageConfigResponse.status, 503);
  const storageConfigBody = await storageConfigResponse.json();
  assert.equal(storageConfigBody.error.includes("Storage backend is not configured"), true);
});

test("assertApiToken enforces token only when production + required", () => {
  const permissive = loadAssertApiTokenWithEnv({
    NODE_ENV: "test",
    API_TOKEN_REQUIRED: "false",
    API_BEARER_TOKEN: ""
  });
  assert.deepEqual(permissive(new Headers()), { ok: true });

  const missingConfiguredToken = loadAssertApiTokenWithEnv({
    NODE_ENV: "production",
    API_TOKEN_REQUIRED: "true",
    API_BEARER_TOKEN: ""
  });
  assert.deepEqual(missingConfiguredToken(new Headers({ "x-api-token": "any" })), { ok: false });

  const missingProvidedToken = loadAssertApiTokenWithEnv({
    NODE_ENV: "production",
    API_TOKEN_REQUIRED: "true",
    API_BEARER_TOKEN: "secret-token"
  });
  assert.deepEqual(missingProvidedToken(new Headers()), { ok: false });

  const mismatch = loadAssertApiTokenWithEnv({
    NODE_ENV: "production",
    API_TOKEN_REQUIRED: "true",
    API_BEARER_TOKEN: "secret-token"
  });
  assert.deepEqual(mismatch(new Headers({ "x-api-token": "wrong-token" })), { ok: false });

  const matched = loadAssertApiTokenWithEnv({
    NODE_ENV: "production",
    API_TOKEN_REQUIRED: "true",
    API_BEARER_TOKEN: "secret-token"
  });
  assert.deepEqual(matched(new Headers({ "x-api-token": "secret-token" })), { ok: true });
});

test("redactForLogs masks sensitive keys and preserves non-sensitive fields", () => {
  const { redactForLogs } = require(REDACT_MODULE_PATH);

  const input = {
    request_id: "req_123",
    token: "abc",
    nested: {
      Authorization: "Bearer secret",
      safe_value: "ok"
    },
    items: [
      {
        service_role: "role-key",
        label: "visible"
      }
    ]
  };

  const redacted = redactForLogs(input);
  assert.equal(redacted.request_id, "req_123");
  assert.equal(redacted.token, "***");
  assert.equal(redacted.nested.Authorization, "***");
  assert.equal(redacted.nested.safe_value, "ok");
  assert.equal(redacted.items[0].service_role, "***");
  assert.equal(redacted.items[0].label, "visible");
});

test("parseEnv validates dev seed token requirement", () => {
  const { parseEnv } = require(ENV_MODULE_PATH);

  assert.throws(
    () =>
      parseEnv({
        NODE_ENV: "test",
        ENABLE_DEV_SEED_API: "true"
      }),
    /DEV_SEED_TOKEN is required/
  );

  const parsed = parseEnv({
    NODE_ENV: "test",
    ENABLE_DEV_SEED_API: "true",
    DEV_SEED_TOKEN: "seed-token",
    API_TOKEN_REQUIRED: "true",
    AUTO_PICK_TOP1: "false",
    ALLOW_FILE_STORAGE_IN_PRODUCTION: "true"
  });

  assert.equal(parsed.ENABLE_DEV_SEED_API, true);
  assert.equal(parsed.DEV_SEED_TOKEN, "seed-token");
  assert.equal(parsed.API_TOKEN_REQUIRED, true);
  assert.equal(parsed.AUTO_PICK_TOP1, false);
  assert.equal(parsed.ALLOW_FILE_STORAGE_IN_PRODUCTION, true);

  const normalizedBoolean = parseEnv({
    NODE_ENV: "test",
    AUTH_V2_ENABLED: "\"true\"",
    RUNTIME_ENABLED: "true\n",
    ENABLE_AGENT_CHAT_CONTROL: "'false",
    NEXT_PUBLIC_ONBOARDING_BYPASS_ENABLED: "false'"
  });
  assert.equal(normalizedBoolean.AUTH_V2_ENABLED, true);
  assert.equal(normalizedBoolean.RUNTIME_ENABLED, true);
  assert.equal(normalizedBoolean.ENABLE_AGENT_CHAT_CONTROL, false);
  assert.equal(normalizedBoolean.NEXT_PUBLIC_ONBOARDING_BYPASS_ENABLED, false);

  const normalizedSupabase = parseEnv({
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "replace-with-your-project-url",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: ""
  });

  assert.equal(normalizedSupabase.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321");
  assert.equal(normalizedSupabase.NEXT_PUBLIC_SUPABASE_ANON_KEY, "dev-anon-key");
  assert.equal(normalizedSupabase.SUPABASE_SERVICE_ROLE_KEY, "dev-service-role-key");

  const invalidSupabaseUrl = parseEnv({
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "not-a-valid-url",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service"
  });
  assert.equal(invalidSupabaseUrl.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321");
});

test("storage repository falls back to file storage when supabase url is invalid", () => {
  const getStorageRepository = withEnvPatch(
    {
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "not-a-valid-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "real-service-role-key",
      ALLOW_FILE_STORAGE_IN_PRODUCTION: "true"
    },
    () => {
      clearCachedModules([STORAGE_INDEX_MODULE_PATH, ENV_MODULE_PATH]);
      return require(STORAGE_INDEX_MODULE_PATH).getStorageRepository;
    }
  );

  const storage = getStorageRepository();
  assert.equal(storage.constructor.name, "FileStorageRepository");
});

test("storage repository throws in production when supabase is invalid and file fallback is disabled", () => {
  const getStorageRepository = withEnvPatch(
    {
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "not-a-valid-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "real-service-role-key",
      ALLOW_FILE_STORAGE_IN_PRODUCTION: "false"
    },
    () => {
      clearCachedModules([STORAGE_INDEX_MODULE_PATH, ENV_MODULE_PATH]);
      return require(STORAGE_INDEX_MODULE_PATH).getStorageRepository;
    }
  );

  assert.throws(() => getStorageRepository(), /Storage backend not configured for production/);
});

test("file storage runtime dir uses tmp on serverless and supports custom data dir", () => {
  const { resolveFileStorageRuntimeDir } = require(FILE_STORAGE_MODULE_PATH);

  const serverlessDir = resolveFileStorageRuntimeDir({ VERCEL: "1" }, "/var/task");
  assert.equal(serverlessDir.startsWith(tmpdir()), true);

  const customDir = resolveFileStorageRuntimeDir(
    {
      AB_AURORA_DATA_DIR: "/custom/data"
    },
    "/var/task"
  );
  assert.equal(customDir, "/custom/data/runtime");
});
