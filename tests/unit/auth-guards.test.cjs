process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AUTH_TEST_ACCESS_TOKEN,
  AUTH_TEST_USER_ID,
  createAuthFetchMock,
  authJsonHeaders
} = require("../helpers/auth-fetch.cjs");

const GUARDS_MODULE_PATH = "../../.tmp-tests/lib/auth/guards.js";
const ENV_MODULE_PATH = "../../.tmp-tests/lib/env.js";

function clearCachedModules() {
  for (const path of [GUARDS_MODULE_PATH, ENV_MODULE_PATH]) {
    try {
      delete require.cache[require.resolve(path)];
    } catch {
      // ignore
    }
  }
}

function withEnv(envPatch, load) {
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
    clearCachedModules();
    return load();
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

function createSessionRecord(ownerUserId) {
  return {
    id: "sess_guard_1",
    owner_user_id: ownerUserId,
    mode: "mode_b",
    product: "p",
    audience: "a",
    style_keywords: [],
    constraint: null,
    current_step: "interview_collect",
    status: "idle",
    auto_continue: true,
    auto_pick_top1: true,
    paused: false,
    intent_confidence: null,
    variation_width: null,
    latest_top3: null,
    selected_candidate_id: null,
    draft_spec: null,
    final_spec: null,
    revision_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

test("requireUser returns 401 when bearer token is missing", async () => {
  const { requireUser } = withEnv(
    {
      AUTH_V2_ENABLED: "true"
    },
    () => require(GUARDS_MODULE_PATH)
  );
  global.fetch = createAuthFetchMock();
  const result = await requireUser(new Request("http://localhost"), "req_guard_401");
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
});

test("requireUser + requireEntitlement enforce supabase identity and entitlement", async () => {
  const { requireUser, requireEntitlement } = withEnv(
    {
      AUTH_V2_ENABLED: "true"
    },
    () => require(GUARDS_MODULE_PATH)
  );
  global.fetch = createAuthFetchMock({
    userId: AUTH_TEST_USER_ID,
    hasAuroraAccess: false
  });

  const auth = await requireUser(
    new Request("http://localhost", { headers: authJsonHeaders({}, AUTH_TEST_ACCESS_TOKEN) }),
    "req_guard_auth"
  );
  assert.equal(auth.ok, true);
  const entitlement = await requireEntitlement(auth.value, "req_guard_forbidden");
  assert.equal(entitlement.ok, false);
  assert.equal(entitlement.response.status, 403);
});

test("requireUser in bypass mode reuses the bearer user's id", async () => {
  const { requireUser } = withEnv(
    {
      AUTH_V2_ENABLED: "true",
      NEXT_PUBLIC_AUTH_BYPASS_ENABLED: "true"
    },
    () => require(GUARDS_MODULE_PATH)
  );
  global.fetch = createAuthFetchMock({
    userId: AUTH_TEST_USER_ID
  });

  const auth = await requireUser(
    new Request("http://localhost", { headers: authJsonHeaders({}, AUTH_TEST_ACCESS_TOKEN) }),
    "req_guard_bypass"
  );

  assert.equal(auth.ok, true);
  assert.equal(auth.value.userId, AUTH_TEST_USER_ID);
  assert.equal(auth.value.authMode, "legacy_token");
});

test("requireSessionOwnership hides non-owned sessions as 404", async () => {
  const { requireSessionOwnership } = withEnv(
    {
      AUTH_V2_ENABLED: "true"
    },
    () => require(GUARDS_MODULE_PATH)
  );
  const storage = {
    getSession: async () => createSessionRecord("22222222-2222-4222-8222-222222222222")
  };

  const owned = await requireSessionOwnership({
    storage,
    auth: {
      userId: AUTH_TEST_USER_ID,
      authMode: "supabase"
    },
    sessionId: "sess_guard_1",
    requestId: "req_guard_not_found"
  });

  assert.equal(owned.ok, false);
  assert.equal(owned.response.status, 404);
});
