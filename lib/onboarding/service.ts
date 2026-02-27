import { createHash, randomUUID } from "crypto";
import { env } from "../env";

type JsonMap = Record<string, unknown>;

type RestMethod = "GET" | "POST" | "PATCH";

type OnboardingStateRow = {
  id: string;
  state_hash: string;
  nonce_hash: string;
  supabase_user_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

type OnboardingCodeRow = {
  id: string;
  code_hash: string;
  state_hash: string;
  issuer: string;
  issuer_subject: string;
  entitlement_key: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

type AccountLinkRow = {
  id: string;
  supabase_user_id: string;
  issuer: string;
  issuer_subject: string;
  linked_at: string;
  revoked_at: string | null;
};

type UserEntitlementRow = {
  id: string;
  supabase_user_id: string;
  entitlement_key: string;
  status: "active" | "revoked";
  version: number;
  source: string;
  created_at: string;
  updated_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function addSecondsIso(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isExpired(iso: string): boolean {
  return Date.parse(iso) <= Date.now();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildPkceChallenge(codeVerifier: string): string {
  const digest = createHash("sha256").update(codeVerifier).digest();
  return toBase64Url(digest);
}

function buildSupabaseAdminBaseUrl(): string {
  return `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/rest/v1`;
}

function buildSupabaseAdminHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function requestRows<T>(input: {
  method: RestMethod;
  path: string;
  query?: Record<string, string>;
  body?: JsonMap;
  prefer?: string;
}): Promise<T[]> {
  const url = new URL(`${buildSupabaseAdminBaseUrl()}/${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method: input.method,
    headers: buildSupabaseAdminHeaders({
      Prefer: input.prefer ?? "return=representation"
    }),
    body: input.body ? JSON.stringify(input.body) : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase onboarding request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return [];
  }

  const payload = (await response.json()) as T[] | T;
  return Array.isArray(payload) ? payload : [payload];
}

function ensureStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toOnboardingStateRow(row: JsonMap): OnboardingStateRow {
  return {
    id: ensureStringValue(row.id),
    state_hash: ensureStringValue(row.state_hash),
    nonce_hash: ensureStringValue(row.nonce_hash),
    supabase_user_id: ensureStringValue(row.supabase_user_id),
    redirect_uri: ensureStringValue(row.redirect_uri),
    code_challenge: ensureStringValue(row.code_challenge),
    code_challenge_method: ensureStringValue(row.code_challenge_method, "S256"),
    expires_at: ensureStringValue(row.expires_at),
    consumed_at: typeof row.consumed_at === "string" ? row.consumed_at : null,
    created_at: ensureStringValue(row.created_at)
  };
}

function toOnboardingCodeRow(row: JsonMap): OnboardingCodeRow {
  return {
    id: ensureStringValue(row.id),
    code_hash: ensureStringValue(row.code_hash),
    state_hash: ensureStringValue(row.state_hash),
    issuer: ensureStringValue(row.issuer),
    issuer_subject: ensureStringValue(row.issuer_subject),
    entitlement_key: ensureStringValue(row.entitlement_key),
    expires_at: ensureStringValue(row.expires_at),
    consumed_at: typeof row.consumed_at === "string" ? row.consumed_at : null,
    created_at: ensureStringValue(row.created_at)
  };
}

function toAccountLinkRow(row: JsonMap): AccountLinkRow {
  return {
    id: ensureStringValue(row.id),
    supabase_user_id: ensureStringValue(row.supabase_user_id),
    issuer: ensureStringValue(row.issuer),
    issuer_subject: ensureStringValue(row.issuer_subject),
    linked_at: ensureStringValue(row.linked_at),
    revoked_at: typeof row.revoked_at === "string" ? row.revoked_at : null
  };
}

function toUserEntitlementRow(row: JsonMap): UserEntitlementRow {
  return {
    id: ensureStringValue(row.id),
    supabase_user_id: ensureStringValue(row.supabase_user_id),
    entitlement_key: ensureStringValue(row.entitlement_key),
    status: row.status === "revoked" ? "revoked" : "active",
    version: typeof row.version === "number" ? row.version : Number(row.version ?? 1),
    source: ensureStringValue(row.source),
    created_at: ensureStringValue(row.created_at),
    updated_at: ensureStringValue(row.updated_at)
  };
}

export class OnboardingError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function createOnboardingState(input: {
  userId: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
}): Promise<{ state: string; authorizeUrl: string; expiresAt: string }> {
  if (!env.MOCK_ISSUER_ENABLED) {
    throw new OnboardingError("MOCK_ISSUER_DISABLED", "Mock issuer is disabled.", 503);
  }
  const stateHash = sha256Hex(input.state);
  const rows = await requestRows<JsonMap>({
    method: "POST",
    path: "oauth_onboarding_states",
    body: {
      state_hash: stateHash,
      nonce_hash: sha256Hex(input.nonce),
      supabase_user_id: input.userId,
      redirect_uri: input.redirectUri,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
      expires_at: addSecondsIso(env.ONBOARDING_STATE_TTL_SEC)
    }
  });
  const saved = toOnboardingStateRow(rows[0]);
  const authorizeUrl = `/api/mock-issuer/authorize?state=${encodeURIComponent(input.state)}`;
  return {
    state: input.state,
    authorizeUrl,
    expiresAt: saved.expires_at
  };
}

async function findStateByRawState(state: string): Promise<OnboardingStateRow | null> {
  const rows = await requestRows<JsonMap>({
    method: "GET",
    path: "oauth_onboarding_states",
    query: {
      state_hash: `eq.${sha256Hex(state)}`,
      select: "*",
      limit: "1"
    }
  });
  return rows.length > 0 ? toOnboardingStateRow(rows[0]) : null;
}

function assertActiveState(stateRow: OnboardingStateRow): void {
  if (stateRow.consumed_at) {
    throw new OnboardingError("ONBOARDING_STATE_CONSUMED", "Onboarding state already consumed.");
  }
  if (isExpired(stateRow.expires_at)) {
    throw new OnboardingError("ONBOARDING_STATE_EXPIRED", "Onboarding state expired.");
  }
}

function assertActiveCode(codeRow: OnboardingCodeRow): void {
  if (codeRow.consumed_at) {
    throw new OnboardingError("ONBOARDING_CODE_CONSUMED", "Onboarding code already consumed.");
  }
  if (isExpired(codeRow.expires_at)) {
    throw new OnboardingError("ONBOARDING_CODE_EXPIRED", "Onboarding code expired.");
  }
}

function createOneTimeCode(): string {
  return `${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
}

export async function issueMockCodeByState(state: string): Promise<{ code: string; redirectUri: string }> {
  if (!env.MOCK_ISSUER_ENABLED) {
    throw new OnboardingError("MOCK_ISSUER_DISABLED", "Mock issuer is disabled.", 503);
  }
  const stateRow = await findStateByRawState(state);
  if (!stateRow) {
    throw new OnboardingError("ONBOARDING_INVALID_STATE", "Unknown onboarding state.");
  }
  assertActiveState(stateRow);

  const code = createOneTimeCode();
  await requestRows<JsonMap>({
    method: "POST",
    path: "oauth_onboarding_codes",
    body: {
      code_hash: sha256Hex(code),
      state_hash: stateRow.state_hash,
      issuer: env.MOCK_ISSUER_NAME,
      issuer_subject: `mock:${stateRow.supabase_user_id}`,
      entitlement_key: "aurora.access",
      expires_at: addSecondsIso(env.ONBOARDING_CODE_TTL_SEC)
    }
  });
  return {
    code,
    redirectUri: stateRow.redirect_uri
  };
}

async function consumeCodeRow(codeRow: OnboardingCodeRow): Promise<void> {
  const rows = await requestRows<JsonMap>({
    method: "PATCH",
    path: "oauth_onboarding_codes",
    query: {
      id: `eq.${codeRow.id}`,
      consumed_at: "is.null",
      select: "id"
    },
    body: {
      consumed_at: nowIso()
    }
  });
  if (rows.length === 0) {
    throw new OnboardingError("ONBOARDING_CODE_CONSUMED", "Onboarding code already consumed.");
  }
}

async function consumeStateRow(stateRow: OnboardingStateRow): Promise<void> {
  const rows = await requestRows<JsonMap>({
    method: "PATCH",
    path: "oauth_onboarding_states",
    query: {
      id: `eq.${stateRow.id}`,
      consumed_at: "is.null",
      select: "id"
    },
    body: {
      consumed_at: nowIso()
    }
  });
  if (rows.length === 0) {
    throw new OnboardingError("ONBOARDING_STATE_CONSUMED", "Onboarding state already consumed.");
  }
}

async function getCodeByRawCodeAndState(code: string, stateHash: string): Promise<OnboardingCodeRow | null> {
  const rows = await requestRows<JsonMap>({
    method: "GET",
    path: "oauth_onboarding_codes",
    query: {
      code_hash: `eq.${sha256Hex(code)}`,
      state_hash: `eq.${stateHash}`,
      select: "*",
      limit: "1"
    }
  });
  return rows.length > 0 ? toOnboardingCodeRow(rows[0]) : null;
}

async function findActiveLinkBySubject(issuer: string, issuerSubject: string): Promise<AccountLinkRow | null> {
  const rows = await requestRows<JsonMap>({
    method: "GET",
    path: "account_links",
    query: {
      issuer: `eq.${issuer}`,
      issuer_subject: `eq.${issuerSubject}`,
      revoked_at: "is.null",
      select: "*",
      limit: "1"
    }
  });
  return rows.length > 0 ? toAccountLinkRow(rows[0]) : null;
}

async function findActiveLinkByUser(issuer: string, userId: string): Promise<AccountLinkRow | null> {
  const rows = await requestRows<JsonMap>({
    method: "GET",
    path: "account_links",
    query: {
      issuer: `eq.${issuer}`,
      supabase_user_id: `eq.${userId}`,
      revoked_at: "is.null",
      select: "*",
      limit: "1"
    }
  });
  return rows.length > 0 ? toAccountLinkRow(rows[0]) : null;
}

async function revokeAccountLink(linkId: string): Promise<void> {
  await requestRows<JsonMap>({
    method: "PATCH",
    path: "account_links",
    query: {
      id: `eq.${linkId}`,
      revoked_at: "is.null",
      select: "id"
    },
    body: {
      revoked_at: nowIso()
    }
  });
}

async function createAccountLink(input: { issuer: string; issuerSubject: string; userId: string }): Promise<void> {
  await requestRows<JsonMap>({
    method: "POST",
    path: "account_links",
    body: {
      issuer: input.issuer,
      issuer_subject: input.issuerSubject,
      supabase_user_id: input.userId
    }
  });
}

async function upsertEntitlement(input: {
  userId: string;
  entitlementKey: string;
  source: string;
  nextStatus: "active" | "revoked";
}): Promise<UserEntitlementRow> {
  const existingRows = await requestRows<JsonMap>({
    method: "GET",
    path: "user_entitlements",
    query: {
      supabase_user_id: `eq.${input.userId}`,
      entitlement_key: `eq.${input.entitlementKey}`,
      select: "*",
      limit: "1"
    }
  });
  const currentVersion = existingRows.length > 0 ? toUserEntitlementRow(existingRows[0]).version : 0;
  const rows = await requestRows<JsonMap>({
    method: "POST",
    path: "user_entitlements",
    query: {
      on_conflict: "supabase_user_id,entitlement_key"
    },
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      supabase_user_id: input.userId,
      entitlement_key: input.entitlementKey,
      status: input.nextStatus,
      version: currentVersion + 1,
      source: input.source
    }
  });
  return toUserEntitlementRow(rows[0]);
}

async function recordEventApplied(input: {
  eventId: string;
  source: string;
  userId: string;
  entitlementKey: string;
  version: number;
  payload: Record<string, unknown>;
}): Promise<void> {
  await requestRows<JsonMap>({
    method: "POST",
    path: "entitlement_events_applied",
    query: {
      on_conflict: "source,event_id"
    },
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: {
      source: input.source,
      event_id: input.eventId,
      supabase_user_id: input.userId,
      entitlement_key: input.entitlementKey,
      version: input.version,
      payload: input.payload
    }
  });
}

export async function exchangeOnboardingCode(input: {
  userId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  code: string;
}): Promise<{
  onboarding_complete: boolean;
  issuer: string;
  issuer_subject: string;
  entitlement_key: string;
  entitlement_version: number;
}> {
  const stateRow = await findStateByRawState(input.state);
  if (!stateRow) {
    throw new OnboardingError("ONBOARDING_INVALID_STATE", "Unknown onboarding state.");
  }
  if (stateRow.supabase_user_id !== input.userId) {
    throw new OnboardingError("ONBOARDING_STATE_USER_MISMATCH", "Onboarding state user mismatch.");
  }
  assertActiveState(stateRow);

  if (stateRow.nonce_hash !== sha256Hex(input.nonce)) {
    throw new OnboardingError("ONBOARDING_INVALID_NONCE", "Invalid onboarding nonce.");
  }

  if (stateRow.code_challenge_method !== "S256") {
    throw new OnboardingError("ONBOARDING_INVALID_CHALLENGE_METHOD", "Unsupported code challenge method.");
  }
  const calculatedChallenge = buildPkceChallenge(input.codeVerifier);
  if (calculatedChallenge !== stateRow.code_challenge) {
    throw new OnboardingError("ONBOARDING_INVALID_PKCE", "Invalid PKCE verifier.");
  }

  const codeRow = await getCodeByRawCodeAndState(input.code, stateRow.state_hash);
  if (!codeRow) {
    throw new OnboardingError("ONBOARDING_INVALID_CODE", "Unknown onboarding code.");
  }
  assertActiveCode(codeRow);

  await consumeCodeRow(codeRow);
  await consumeStateRow(stateRow);

  const linkedBySubject = await findActiveLinkBySubject(codeRow.issuer, codeRow.issuer_subject);
  if (linkedBySubject && linkedBySubject.supabase_user_id !== input.userId) {
    throw new OnboardingError("ONBOARDING_SUBJECT_ALREADY_LINKED", "Issuer subject already linked.");
  }

  const linkedByUser = await findActiveLinkByUser(codeRow.issuer, input.userId);
  if (linkedByUser && linkedByUser.issuer_subject !== codeRow.issuer_subject) {
    await revokeAccountLink(linkedByUser.id);
  }
  if (!linkedBySubject && (!linkedByUser || linkedByUser.issuer_subject !== codeRow.issuer_subject)) {
    await createAccountLink({
      issuer: codeRow.issuer,
      issuerSubject: codeRow.issuer_subject,
      userId: input.userId
    });
  }

  const entitlement = await upsertEntitlement({
    userId: input.userId,
    entitlementKey: codeRow.entitlement_key,
    source: codeRow.issuer,
    nextStatus: "active"
  });
  await recordEventApplied({
    eventId: `onboarding:${codeRow.code_hash}`,
    source: codeRow.issuer,
    userId: input.userId,
    entitlementKey: codeRow.entitlement_key,
    version: entitlement.version,
    payload: {
      issuer_subject: codeRow.issuer_subject,
      linked: true
    }
  });

  return {
    onboarding_complete: true,
    issuer: codeRow.issuer,
    issuer_subject: codeRow.issuer_subject,
    entitlement_key: codeRow.entitlement_key,
    entitlement_version: entitlement.version
  };
}

export async function setEntitlementStatus(input: {
  userId: string;
  entitlementKey: string;
  status: "active" | "revoked";
  source: string;
  eventId: string;
  payload?: Record<string, unknown>;
}): Promise<UserEntitlementRow> {
  const entitlement = await upsertEntitlement({
    userId: input.userId,
    entitlementKey: input.entitlementKey,
    source: input.source,
    nextStatus: input.status
  });
  await recordEventApplied({
    eventId: input.eventId,
    source: input.source,
    userId: input.userId,
    entitlementKey: input.entitlementKey,
    version: entitlement.version,
    payload: input.payload ?? {}
  });
  return entitlement;
}

export async function hasActiveEntitlement(userId: string, entitlementKey: string): Promise<boolean> {
  const rows = await requestRows<JsonMap>({
    method: "GET",
    path: "user_entitlements",
    query: {
      supabase_user_id: `eq.${userId}`,
      entitlement_key: `eq.${entitlementKey}`,
      status: "eq.active",
      select: "id",
      limit: "1"
    }
  });
  return rows.length > 0;
}

export async function getAuthStateSummary(userId: string): Promise<{
  onboarding_complete: boolean;
  entitlements: Array<{ key: string; status: "active" | "revoked"; version: number }>;
}> {
  const [linksRaw, entitlementsRaw] = await Promise.all([
    requestRows<JsonMap>({
      method: "GET",
      path: "account_links",
      query: {
        supabase_user_id: `eq.${userId}`,
        revoked_at: "is.null",
        select: "id",
        limit: "1"
      }
    }),
    requestRows<JsonMap>({
      method: "GET",
      path: "user_entitlements",
      query: {
        supabase_user_id: `eq.${userId}`,
        select: "*",
        order: "updated_at.desc"
      }
    })
  ]);

  const entitlements = entitlementsRaw.map((row) => toUserEntitlementRow(row)).map((row) => ({
    key: row.entitlement_key,
    status: row.status,
    version: row.version
  }));
  const hasAccess = entitlements.some((entry) => entry.key === "aurora.access" && entry.status === "active");

  return {
    onboarding_complete: linksRaw.length > 0 && hasAccess,
    entitlements
  };
}
