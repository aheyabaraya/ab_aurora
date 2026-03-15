import type { NextResponse } from "next/server";
import type {
  JobRecord,
  PackRecord,
  SessionRecord
} from "../agent/types";
import { jsonError } from "../api/http";
import { env } from "../env";
import { hasActiveEntitlement } from "../onboarding/service";
import type { RuntimeGoalRecord } from "../runtime/types";
import type { StorageRepository } from "../storage/types";
import { assertApiToken } from "./api-token";
import { getSupabaseUserFromRequest } from "./supabase-user";

export type AuthMode = "supabase" | "legacy_token";

export type AuthContext = {
  userId: string;
  authMode: AuthMode;
};

const LEGACY_FALLBACK_USER_ID = "00000000-0000-0000-0000-000000000000";
const BYPASS_SUPABASE_GUARDS_FOR_TESTING =
  process.env.NODE_ENV === "test"
    ? process.env.NEXT_PUBLIC_AUTH_BYPASS_ENABLED === "true"
    : process.env.NEXT_PUBLIC_AUTH_BYPASS_ENABLED !== "false";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function normalizeBypassUserId(value: unknown): string | null {
  if (!isUuid(value)) {
    return null;
  }
  return value.toLowerCase();
}

async function requestAdminRows(path: string, query: Record<string, string>): Promise<Array<Record<string, unknown>>> {
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) {
    return [];
  }
  return body as Array<Record<string, unknown>>;
}

async function resolveLegacyBypassUserId(): Promise<string> {
  const explicit = normalizeBypassUserId(process.env.AUTH_BYPASS_USER_ID);
  if (explicit) {
    return explicit;
  }

  const probes: Array<{ path: string; query: Record<string, string>; field: string }> = [
    {
      path: "users",
      query: {
        select: "id",
        order: "created_at.desc",
        limit: "1"
      },
      field: "id"
    },
    {
      path: "account_links",
      query: {
        revoked_at: "is.null",
        select: "supabase_user_id",
        order: "linked_at.desc",
        limit: "1"
      },
      field: "supabase_user_id"
    },
    {
      path: "user_entitlements",
      query: {
        status: "eq.active",
        select: "supabase_user_id",
        order: "updated_at.desc",
        limit: "1"
      },
      field: "supabase_user_id"
    },
    {
      path: "sessions",
      query: {
        owner_user_id: "not.is.null",
        select: "owner_user_id",
        order: "updated_at.desc",
        limit: "1"
      },
      field: "owner_user_id"
    }
  ];

  for (const probe of probes) {
    try {
      const rows = await requestAdminRows(probe.path, probe.query);
      if (rows.length === 0) {
        continue;
      }
      const candidate = normalizeBypassUserId(rows[0]?.[probe.field]);
      if (candidate) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return LEGACY_FALLBACK_USER_ID;
}

type GuardSuccess<T> = {
  ok: true;
  value: T;
};

type GuardFailure = {
  ok: false;
  response: NextResponse<{ error: string; request_id: string }>;
};

type GuardResult<T> = GuardSuccess<T> | GuardFailure;

function fail(status: number, message: string, requestId: string): GuardFailure {
  return {
    ok: false,
    response: jsonError(message, status, requestId)
  };
}

function ok<T>(value: T): GuardSuccess<T> {
  return {
    ok: true,
    value
  };
}

export async function requireUser(request: Request, requestId: string): Promise<GuardResult<AuthContext>> {
  // TEMP: when auth bypass is enabled, keep entitlement/ownership relaxed but prefer a real
  // Supabase user id from the bearer token so DB foreign keys still point at an existing user.
  if (BYPASS_SUPABASE_GUARDS_FOR_TESTING) {
    const user = await getSupabaseUserFromRequest(request);
    if (user?.id) {
      return ok({
        userId: user.id,
        authMode: "legacy_token"
      });
    }
    const fallbackUserId = await resolveLegacyBypassUserId();
    return ok({
      userId: fallbackUserId,
      authMode: "legacy_token"
    });
  }

  if (!env.AUTH_V2_ENABLED) {
    const tokenAuth = assertApiToken(new Headers(request.headers));
    if (!tokenAuth.ok) {
      return fail(401, "Unauthorized", requestId);
    }
    const fallbackUserId = await resolveLegacyBypassUserId();
    return ok({
      userId: fallbackUserId,
      authMode: "legacy_token"
    });
  }

  const user = await getSupabaseUserFromRequest(request);
  if (!user) {
    return fail(401, "Unauthorized", requestId);
  }
  return ok({
    userId: user.id,
    authMode: "supabase"
  });
}

export async function requireEntitlement(
  auth: AuthContext,
  requestId: string,
  entitlementKey = "aurora.access"
): Promise<GuardResult<true>> {
  if (auth.authMode === "legacy_token") {
    return ok(true);
  }
  const permitted = await hasActiveEntitlement(auth.userId, entitlementKey);
  if (!permitted) {
    return fail(403, "Forbidden", requestId);
  }
  return ok(true);
}

export async function requireSessionOwnership(input: {
  storage: StorageRepository;
  auth: AuthContext;
  sessionId: string;
  requestId: string;
}): Promise<GuardResult<SessionRecord>> {
  const session = await input.storage.getSession(input.sessionId);
  if (!session) {
    return fail(404, "Resource not found", input.requestId);
  }
  if (input.auth.authMode === "legacy_token") {
    return ok(session);
  }
  if (!session.owner_user_id || session.owner_user_id !== input.auth.userId) {
    return fail(404, "Resource not found", input.requestId);
  }
  return ok(session);
}

export async function requireGoalOwnership(input: {
  storage: StorageRepository;
  auth: AuthContext;
  goalId: string;
  requestId: string;
}): Promise<GuardResult<RuntimeGoalRecord>> {
  const goal = await input.storage.getRuntimeGoal(input.goalId);
  if (!goal) {
    return fail(404, "Resource not found", input.requestId);
  }
  const sessionCheck = await requireSessionOwnership({
    storage: input.storage,
    auth: input.auth,
    sessionId: goal.session_id,
    requestId: input.requestId
  });
  if (!sessionCheck.ok) {
    return sessionCheck;
  }
  return ok(goal);
}

export async function requireJobOwnership(input: {
  storage: StorageRepository;
  auth: AuthContext;
  jobId: string;
  requestId: string;
}): Promise<GuardResult<JobRecord>> {
  const job = await input.storage.getJob(input.jobId);
  if (!job) {
    return fail(404, "Resource not found", input.requestId);
  }
  const sessionCheck = await requireSessionOwnership({
    storage: input.storage,
    auth: input.auth,
    sessionId: job.session_id,
    requestId: input.requestId
  });
  if (!sessionCheck.ok) {
    return sessionCheck;
  }
  return ok(job);
}

export async function requirePackOwnership(input: {
  storage: StorageRepository;
  auth: AuthContext;
  packId: string;
  requestId: string;
}): Promise<GuardResult<PackRecord>> {
  const pack = await input.storage.getPack(input.packId);
  if (!pack) {
    return fail(404, "Resource not found", input.requestId);
  }
  const sessionCheck = await requireSessionOwnership({
    storage: input.storage,
    auth: input.auth,
    sessionId: pack.session_id,
    requestId: input.requestId
  });
  if (!sessionCheck.ok) {
    return sessionCheck;
  }
  return ok(pack);
}
