const AUTH_TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_TEST_ACCESS_TOKEN = "test-access-token";

function toTargetUrl(input) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return String(input);
}

function getHeaderValue(headers, key) {
  if (!headers) {
    return null;
  }
  if (typeof headers.get === "function") {
    return headers.get(key);
  }
  if (Array.isArray(headers)) {
    const match = headers.find((entry) => entry[0].toLowerCase() === key.toLowerCase());
    return match ? match[1] : null;
  }
  const record = headers;
  const exact = record[key];
  if (typeof exact === "string") {
    return exact;
  }
  const foundKey = Object.keys(record).find((headerKey) => headerKey.toLowerCase() === key.toLowerCase());
  return foundKey ? record[foundKey] : null;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function createAuthFetchMock(input = {}) {
  const userId = input.userId ?? AUTH_TEST_USER_ID;
  const accessToken = input.accessToken ?? AUTH_TEST_ACCESS_TOKEN;
  const hasAuroraAccess = input.hasAuroraAccess ?? true;
  const onboardingComplete = input.onboardingComplete ?? true;
  const delegate = input.delegate;

  return async (url, init = {}) => {
    const targetUrl = toTargetUrl(url);
    if (targetUrl.includes("/auth/v1/user")) {
      const authorization = getHeaderValue(init.headers, "authorization") ?? "";
      if (authorization !== `Bearer ${accessToken}`) {
        return jsonResponse({ error: "invalid token" }, 401);
      }
      return jsonResponse({
        id: userId,
        is_anonymous: true
      });
    }

    if (targetUrl.includes("/rest/v1/user_entitlements")) {
      const query = new URL(targetUrl).searchParams;
      const statusFilter = query.get("status");
      const keyFilter = query.get("entitlement_key");
      const wantsAuroraAccess = keyFilter === "eq.aurora.access" || keyFilter === null;
      const activeRequired = statusFilter === "eq.active";
      if (!wantsAuroraAccess) {
        return jsonResponse([]);
      }
      if (activeRequired && !hasAuroraAccess) {
        return jsonResponse([]);
      }
      return jsonResponse(
        hasAuroraAccess
          ? [
              {
                id: "ent_test_1",
                supabase_user_id: userId,
                entitlement_key: "aurora.access",
                status: "active",
                version: 1,
                source: "ab_aurora_mock",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }
            ]
          : []
      );
    }

    if (targetUrl.includes("/rest/v1/account_links")) {
      if (!onboardingComplete) {
        return jsonResponse([]);
      }
      return jsonResponse([
        {
          id: "lnk_test_1",
          supabase_user_id: userId,
          issuer: "ab_aurora_mock",
          issuer_subject: `mock:${userId}`,
          linked_at: new Date().toISOString(),
          revoked_at: null
        }
      ]);
    }

    if (delegate) {
      return delegate(url, init);
    }

    return jsonResponse({ error: "unhandled mock fetch target", targetUrl }, 404);
  };
}

function authJsonHeaders(extra = {}, accessToken = AUTH_TEST_ACCESS_TOKEN) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    ...extra
  };
}

module.exports = {
  AUTH_TEST_USER_ID,
  AUTH_TEST_ACCESS_TOKEN,
  createAuthFetchMock,
  authJsonHeaders
};
