process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const SERVICE_MODULE_PATH = "../../.tmp-tests/lib/onboarding/service.js";
const ENV_MODULE_PATH = "../../.tmp-tests/lib/env.js";

function clearCachedModules() {
  for (const path of [SERVICE_MODULE_PATH, ENV_MODULE_PATH]) {
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

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function parseQueryValue(query, key) {
  const raw = query.get(key);
  if (!raw) {
    return null;
  }
  if (raw.startsWith("eq.")) {
    return raw.slice(3);
  }
  return raw;
}

function createOnboardingRestMock() {
  const store = {
    states: [],
    codes: [],
    links: [],
    entitlements: [],
    events: []
  };

  function byId(list, id) {
    return list.find((row) => row.id === id) ?? null;
  }

  global.fetch = async (url, init = {}) => {
    const target = typeof url === "string" ? url : url.toString();
    const parsed = new URL(target);
    const path = parsed.pathname;
    const query = parsed.searchParams;
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : {};

    if (path.endsWith("/rest/v1/oauth_onboarding_states")) {
      if (method === "POST") {
        const row = {
          id: `state_${store.states.length + 1}`,
          ...body,
          consumed_at: null,
          created_at: new Date().toISOString()
        };
        store.states.push(row);
        return jsonResponse([row]);
      }
      if (method === "GET") {
        const stateHash = parseQueryValue(query, "state_hash");
        const rows = store.states.filter((row) => (stateHash ? row.state_hash === stateHash : true));
        return jsonResponse(rows.slice(0, Number(query.get("limit") ?? rows.length)));
      }
      if (method === "PATCH") {
        const id = parseQueryValue(query, "id");
        const requiredNull = query.get("consumed_at") === "is.null";
        const row = byId(store.states, id);
        if (!row) {
          return jsonResponse([]);
        }
        if (requiredNull && row.consumed_at !== null) {
          return jsonResponse([]);
        }
        Object.assign(row, body);
        return jsonResponse([row]);
      }
    }

    if (path.endsWith("/rest/v1/oauth_onboarding_codes")) {
      if (method === "POST") {
        const row = {
          id: `code_${store.codes.length + 1}`,
          ...body,
          consumed_at: null,
          created_at: new Date().toISOString()
        };
        store.codes.push(row);
        return jsonResponse([row]);
      }
      if (method === "GET") {
        const codeHash = parseQueryValue(query, "code_hash");
        const stateHash = parseQueryValue(query, "state_hash");
        const rows = store.codes.filter((row) => {
          if (codeHash && row.code_hash !== codeHash) {
            return false;
          }
          if (stateHash && row.state_hash !== stateHash) {
            return false;
          }
          return true;
        });
        return jsonResponse(rows.slice(0, Number(query.get("limit") ?? rows.length)));
      }
      if (method === "PATCH") {
        const id = parseQueryValue(query, "id");
        const requiredNull = query.get("consumed_at") === "is.null";
        const row = byId(store.codes, id);
        if (!row) {
          return jsonResponse([]);
        }
        if (requiredNull && row.consumed_at !== null) {
          return jsonResponse([]);
        }
        Object.assign(row, body);
        return jsonResponse([row]);
      }
    }

    if (path.endsWith("/rest/v1/account_links")) {
      if (method === "GET") {
        const issuer = parseQueryValue(query, "issuer");
        const issuerSubject = parseQueryValue(query, "issuer_subject");
        const userId = parseQueryValue(query, "supabase_user_id");
        const requireActive = query.get("revoked_at") === "is.null";
        const rows = store.links.filter((row) => {
          if (issuer && row.issuer !== issuer) {
            return false;
          }
          if (issuerSubject && row.issuer_subject !== issuerSubject) {
            return false;
          }
          if (userId && row.supabase_user_id !== userId) {
            return false;
          }
          if (requireActive && row.revoked_at !== null) {
            return false;
          }
          return true;
        });
        return jsonResponse(rows.slice(0, Number(query.get("limit") ?? rows.length)));
      }
      if (method === "POST") {
        const row = {
          id: `link_${store.links.length + 1}`,
          ...body,
          linked_at: new Date().toISOString(),
          revoked_at: null
        };
        store.links.push(row);
        return jsonResponse([row]);
      }
      if (method === "PATCH") {
        const id = parseQueryValue(query, "id");
        const requireActive = query.get("revoked_at") === "is.null";
        const row = byId(store.links, id);
        if (!row) {
          return jsonResponse([]);
        }
        if (requireActive && row.revoked_at !== null) {
          return jsonResponse([]);
        }
        Object.assign(row, body);
        return jsonResponse([row]);
      }
    }

    if (path.endsWith("/rest/v1/user_entitlements")) {
      if (method === "GET") {
        const userId = parseQueryValue(query, "supabase_user_id");
        const key = parseQueryValue(query, "entitlement_key");
        const status = parseQueryValue(query, "status");
        const rows = store.entitlements.filter((row) => {
          if (userId && row.supabase_user_id !== userId) {
            return false;
          }
          if (key && row.entitlement_key !== key) {
            return false;
          }
          if (status && row.status !== status) {
            return false;
          }
          return true;
        });
        return jsonResponse(rows.slice(0, Number(query.get("limit") ?? rows.length)));
      }
      if (method === "POST") {
        const existing = store.entitlements.find(
          (row) => row.supabase_user_id === body.supabase_user_id && row.entitlement_key === body.entitlement_key
        );
        if (existing) {
          Object.assign(existing, body, { updated_at: new Date().toISOString() });
          return jsonResponse([existing]);
        }
        const row = {
          id: `ent_${store.entitlements.length + 1}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...body
        };
        store.entitlements.push(row);
        return jsonResponse([row]);
      }
    }

    if (path.endsWith("/rest/v1/entitlement_events_applied")) {
      if (method === "POST") {
        const exists = store.events.some((row) => row.source === body.source && row.event_id === body.event_id);
        if (!exists) {
          store.events.push({
            id: `evt_${store.events.length + 1}`,
            ...body
          });
        }
        return jsonResponse([]);
      }
    }

    return jsonResponse({ error: "unhandled path", path, method }, 404);
  };

  return store;
}

function toPkceChallenge(verifier) {
  const digest = createHash("sha256").update(verifier).digest("base64");
  return digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

test("onboarding service supports single-use exchange and entitlement activation", async () => {
  const store = createOnboardingRestMock();
  const {
    createOnboardingState,
    issueMockCodeByState,
    exchangeOnboardingCode,
    hasActiveEntitlement
  } = withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      ONBOARDING_CODE_TTL_SEC: "300",
      ONBOARDING_STATE_TTL_SEC: "600",
      MOCK_ISSUER_ENABLED: "true",
      MOCK_ISSUER_NAME: "ab_aurora_mock"
    },
    () => require(SERVICE_MODULE_PATH)
  );

  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const state = "state-test-aaaaaaaaaaaaaaaa";
  const nonce = "nonce-test-bbbbbbbbbbbbbbbb";
  const codeVerifier = "verifier-test-cccccccccccccccccccccccccccccccccccccccccccc";
  const redirectUri = "http://localhost:3000/onboarding/callback";
  const codeChallenge = toPkceChallenge(codeVerifier);

  await createOnboardingState({
    userId,
    state,
    nonce,
    codeChallenge,
    redirectUri
  });
  const issued = await issueMockCodeByState(state);
  const exchanged = await exchangeOnboardingCode({
    userId,
    state,
    nonce,
    codeVerifier,
    code: issued.code
  });

  assert.equal(exchanged.onboarding_complete, true);
  assert.equal(exchanged.entitlement_key, "aurora.access");
  assert.equal(await hasActiveEntitlement(userId, "aurora.access"), true);
  assert.equal(store.links.length, 1);
  assert.equal(store.entitlements.length, 1);
});

test("onboarding exchange rejects replay attempts", async () => {
  createOnboardingRestMock();
  const { createOnboardingState, issueMockCodeByState, exchangeOnboardingCode, OnboardingError } = withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      MOCK_ISSUER_ENABLED: "true",
      MOCK_ISSUER_NAME: "ab_aurora_mock"
    },
    () => require(SERVICE_MODULE_PATH)
  );

  const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const state = "state-replay-aaaaaaaaaaaaaaaa";
  const nonce = "nonce-replay-bbbbbbbbbbbbbbbb";
  const codeVerifier = "verifier-replay-ccccccccccccccccccccccccccccccccccccccccccccc";

  await createOnboardingState({
    userId,
    state,
    nonce,
    codeChallenge: toPkceChallenge(codeVerifier),
    redirectUri: "http://localhost:3000/onboarding/callback"
  });
  const issued = await issueMockCodeByState(state);
  await exchangeOnboardingCode({
    userId,
    state,
    nonce,
    codeVerifier,
    code: issued.code
  });

  await assert.rejects(
    () =>
      exchangeOnboardingCode({
        userId,
        state,
        nonce,
        codeVerifier,
        code: issued.code
      }),
    (error) => {
      assert.equal(error instanceof OnboardingError, true);
      assert.equal(error.code, "ONBOARDING_STATE_CONSUMED");
      return true;
    }
  );
});

test("onboarding exchange validates nonce and PKCE", async () => {
  createOnboardingRestMock();
  const { createOnboardingState, issueMockCodeByState, exchangeOnboardingCode, OnboardingError } = withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      MOCK_ISSUER_ENABLED: "true",
      MOCK_ISSUER_NAME: "ab_aurora_mock"
    },
    () => require(SERVICE_MODULE_PATH)
  );

  const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const state = "state-validation-aaaaaaaaaaaa";
  const nonce = "nonce-validation-bbbbbbbbbbbb";
  const codeVerifier = "verifier-validation-cccccccccccccccccccccccccccccccccccccccccc";
  await createOnboardingState({
    userId,
    state,
    nonce,
    codeChallenge: toPkceChallenge(codeVerifier),
    redirectUri: "http://localhost:3000/onboarding/callback"
  });
  const issued = await issueMockCodeByState(state);

  await assert.rejects(
    () =>
      exchangeOnboardingCode({
        userId,
        state,
        nonce: `${nonce}-wrong`,
        codeVerifier,
        code: issued.code
      }),
    (error) => {
      assert.equal(error instanceof OnboardingError, true);
      assert.equal(error.code, "ONBOARDING_INVALID_NONCE");
      return true;
    }
  );

  await assert.rejects(
    () =>
      exchangeOnboardingCode({
        userId,
        state,
        nonce,
        codeVerifier: `${codeVerifier}-wrong`,
        code: issued.code
      }),
    (error) => {
      assert.equal(error instanceof OnboardingError, true);
      assert.equal(error.code, "ONBOARDING_INVALID_PKCE");
      return true;
    }
  );
});

test("onboarding exchange rejects expired code", async () => {
  const store = createOnboardingRestMock();
  const { createOnboardingState, issueMockCodeByState, exchangeOnboardingCode, OnboardingError } = withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      MOCK_ISSUER_ENABLED: "true",
      MOCK_ISSUER_NAME: "ab_aurora_mock"
    },
    () => require(SERVICE_MODULE_PATH)
  );

  const userId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const state = "state-expired-aaaaaaaaaaaaaaaa";
  const nonce = "nonce-expired-bbbbbbbbbbbbbbbb";
  const codeVerifier = "verifier-expired-cccccccccccccccccccccccccccccccccccccccccccc";
  await createOnboardingState({
    userId,
    state,
    nonce,
    codeChallenge: toPkceChallenge(codeVerifier),
    redirectUri: "http://localhost:3000/onboarding/callback"
  });
  const issued = await issueMockCodeByState(state);

  const codeHash = sha256Hex(issued.code);
  const codeRow = store.codes.find((row) => row.code_hash === codeHash);
  codeRow.expires_at = new Date(Date.now() - 60_000).toISOString();

  await assert.rejects(
    () =>
      exchangeOnboardingCode({
        userId,
        state,
        nonce,
        codeVerifier,
        code: issued.code
      }),
    (error) => {
      assert.equal(error instanceof OnboardingError, true);
      assert.equal(error.code, "ONBOARDING_CODE_EXPIRED");
      return true;
    }
  );
});

