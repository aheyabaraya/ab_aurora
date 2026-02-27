process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  AUTH_TEST_ACCESS_TOKEN,
  AUTH_TEST_USER_ID,
  authJsonHeaders
} = require("../helpers/auth-fetch.cjs");

const START_ROUTE_PATH = "../../.tmp-tests/app/api/onboarding/start/route.js";
const AUTHORIZE_ROUTE_PATH = "../../.tmp-tests/app/api/mock-issuer/authorize/route.js";
const EXCHANGE_ROUTE_PATH = "../../.tmp-tests/app/api/onboarding/exchange/route.js";
const AUTH_ME_ROUTE_PATH = "../../.tmp-tests/app/api/auth/me/route.js";
const ENV_MODULE_PATH = "../../.tmp-tests/lib/env.js";
const SERVICE_MODULE_PATH = "../../.tmp-tests/lib/onboarding/service.js";
const GUARDS_MODULE_PATH = "../../.tmp-tests/lib/auth/guards.js";
const SUPABASE_USER_MODULE_PATH = "../../.tmp-tests/lib/auth/supabase-user.js";

function clearCachedModules() {
  for (const path of [
    START_ROUTE_PATH,
    AUTHORIZE_ROUTE_PATH,
    EXCHANGE_ROUTE_PATH,
    AUTH_ME_ROUTE_PATH,
    ENV_MODULE_PATH,
    SERVICE_MODULE_PATH,
    GUARDS_MODULE_PATH,
    SUPABASE_USER_MODULE_PATH
  ]) {
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

function toPkceChallenge(verifier) {
  const digest = createHash("sha256").update(verifier).digest("base64");
  return digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createOnboardingApiMock() {
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

    if (path.endsWith("/auth/v1/user")) {
      const authHeader =
        (typeof init.headers?.get === "function" ? init.headers.get("authorization") : init.headers?.Authorization) ??
        "";
      if (authHeader !== `Bearer ${AUTH_TEST_ACCESS_TOKEN}`) {
        return jsonResponse({ error: "invalid token" }, 401);
      }
      return jsonResponse({
        id: AUTH_TEST_USER_ID,
        is_anonymous: true
      });
    }

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
          ...body,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
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

    return jsonResponse({ error: "unhandled mock path", path, method }, 404);
  };
}

test("onboarding start -> authorize -> exchange completes and auth/me reflects linkage", async () => {
  createOnboardingApiMock();
  const routes = withEnv(
    {
      AUTH_V2_ENABLED: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
      APP_URL: "http://localhost:3000",
      ONBOARDING_CODE_TTL_SEC: "300",
      ONBOARDING_STATE_TTL_SEC: "600",
      MOCK_ISSUER_ENABLED: "true",
      MOCK_ISSUER_NAME: "ab_aurora_mock"
    },
    () => ({
      start: require(START_ROUTE_PATH).POST,
      authorize: require(AUTHORIZE_ROUTE_PATH).GET,
      exchange: require(EXCHANGE_ROUTE_PATH).POST,
      me: require(AUTH_ME_ROUTE_PATH).GET
    })
  );

  const state = "state-api-test-aaaaaaaaaaaaaaaa";
  const nonce = "nonce-api-test-bbbbbbbbbbbbbbbb";
  const codeVerifier = "verifier-api-test-ccccccccccccccccccccccccccccccccccccccccccc";
  const startResponse = await routes.start(
    new Request("http://localhost:3000/api/onboarding/start", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        state,
        nonce,
        code_challenge: toPkceChallenge(codeVerifier),
        code_challenge_method: "S256",
        redirect_uri: "http://localhost:3000/onboarding/callback"
      })
    })
  );
  assert.equal(startResponse.status, 200);
  const startBody = await startResponse.json();
  assert.equal(typeof startBody.authorize_url, "string");

  const authorizeResponse = await routes.authorize(
    new Request(`http://localhost:3000${startBody.authorize_url}`, {
      method: "GET"
    })
  );
  assert.equal(authorizeResponse.status, 302);
  const location = authorizeResponse.headers.get("location");
  assert.ok(location);
  const callbackUrl = new URL(location);
  const code = callbackUrl.searchParams.get("code");
  const redirectedState = callbackUrl.searchParams.get("state");
  assert.ok(code);
  assert.equal(redirectedState, state);

  const exchangeResponse = await routes.exchange(
    new Request("http://localhost:3000/api/onboarding/exchange", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        state,
        nonce,
        code,
        code_verifier: codeVerifier
      })
    })
  );
  assert.equal(exchangeResponse.status, 200);
  const exchangeBody = await exchangeResponse.json();
  assert.equal(exchangeBody.onboarding_complete, true);
  assert.equal(exchangeBody.entitlement_key, "aurora.access");

  const meResponse = await routes.me(
    new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${AUTH_TEST_ACCESS_TOKEN}`
      }
    })
  );
  assert.equal(meResponse.status, 200);
  const meBody = await meResponse.json();
  assert.equal(meBody.onboarding_complete, true);
  assert.equal(Array.isArray(meBody.entitlements), true);
  assert.equal(meBody.entitlements.some((entry) => entry.key === "aurora.access" && entry.status === "active"), true);

  const replayResponse = await routes.exchange(
    new Request("http://localhost:3000/api/onboarding/exchange", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        state,
        nonce,
        code,
        code_verifier: codeVerifier
      })
    })
  );
  assert.equal(replayResponse.status, 400);
  const replayBody = await replayResponse.json();
  assert.equal(replayBody.error_code, "ONBOARDING_STATE_CONSUMED");
});

