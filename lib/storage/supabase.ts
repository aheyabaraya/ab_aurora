import { env } from "../env";
import type {
  ArtifactRecord,
  JobRecord,
  MessageRecord,
  PackRecord,
  SessionRecord
} from "../agent/types";
import { sha256 } from "../utils/hash";
import type {
  CreateArtifactInput,
  CreateJobInput,
  CreatePackInput,
  CreateSessionInput,
  StorageRepository
} from "./types";

type JsonMap = Record<string, unknown>;

const REST_PATH = "/rest/v1";

function nowIso(): string {
  return new Date().toISOString();
}

function toIso(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return nowIso();
}

function assertObject(value: unknown): JsonMap {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonMap;
  }
  return {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function asCandidates(value: unknown): SessionRecord["latest_top3"] {
  if (!Array.isArray(value)) {
    return null;
  }
  return value as SessionRecord["latest_top3"];
}

function asDraftSpec(value: unknown): SessionRecord["draft_spec"] {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as SessionRecord["draft_spec"];
}

function asFinalSpec(value: unknown): SessionRecord["final_spec"] {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as SessionRecord["final_spec"];
}

function buildBaseUrl(): string {
  return env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
}

function buildHeaders(): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
}

async function requestRows<T>(input: {
  method: "GET" | "POST" | "PATCH";
  path: string;
  query?: Record<string, string>;
  body?: JsonMap;
  prefer?: string;
}): Promise<T[]> {
  const url = new URL(`${buildBaseUrl()}${REST_PATH}/${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method: input.method,
    headers: {
      ...buildHeaders(),
      Prefer: input.prefer ?? "return=representation"
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${body}`);
  }

  if (response.status === 204) {
    return [];
  }

  const json = (await response.json()) as T[] | T;
  return Array.isArray(json) ? json : [json];
}

function fromSessionRow(row: JsonMap): SessionRecord {
  const parsedIntentConfidence =
    row.intent_confidence === null || row.intent_confidence === undefined
      ? null
      : Number(row.intent_confidence);

  return {
    id: String(row.id),
    mode: row.mode === "mode_a" ? "mode_a" : "mode_b",
    product: String(row.product ?? ""),
    audience: String(row.audience ?? ""),
    style_keywords: asStringArray(row.style_keywords),
    constraint: typeof row.constraint === "string" ? row.constraint : null,
    current_step: (row.current_step as SessionRecord["current_step"]) ?? "interview_collect",
    status: (row.status as SessionRecord["status"]) ?? "idle",
    auto_continue: Boolean(row.auto_continue),
    auto_pick_top1: Boolean(row.auto_pick_top1),
    paused: Boolean(row.paused),
    intent_confidence: parsedIntentConfidence,
    variation_width: (row.variation_width as SessionRecord["variation_width"]) ?? null,
    latest_top3: asCandidates(row.latest_top3),
    selected_candidate_id:
      typeof row.selected_candidate_id === "string" ? row.selected_candidate_id : null,
    draft_spec: asDraftSpec(row.draft_spec),
    final_spec: asFinalSpec(row.final_spec),
    revision_count:
      typeof row.revision_count === "number" ? row.revision_count : Number(row.revision_count ?? 0),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

function fromMessageRow(row: JsonMap): MessageRecord {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    role: (row.role as MessageRecord["role"]) ?? "assistant",
    content: String(row.content ?? ""),
    metadata: row.metadata ? assertObject(row.metadata) : null,
    created_at: toIso(row.created_at)
  };
}

function fromJobRow(row: JsonMap): JobRecord {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    step: (row.step as JobRecord["step"]) ?? "interview_collect",
    status: (row.status as JobRecord["status"]) ?? "pending",
    payload: row.payload ? assertObject(row.payload) : null,
    logs: asStringArray(row.logs),
    error: typeof row.error === "string" ? row.error : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

function fromArtifactRow(row: JsonMap): ArtifactRecord {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    job_id: typeof row.job_id === "string" ? row.job_id : null,
    step: (row.step as ArtifactRecord["step"]) ?? "interview_collect",
    kind: (row.kind as ArtifactRecord["kind"]) ?? "interview",
    title: String(row.title ?? ""),
    content: assertObject(row.content),
    hash: String(row.hash ?? ""),
    created_at: toIso(row.created_at)
  };
}

function fromPackRow(row: JsonMap): PackRecord {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    meta: assertObject(row.meta),
    bundle_hash: String(row.bundle_hash ?? ""),
    cid: typeof row.cid === "string" ? row.cid : null,
    mint_tx: typeof row.mint_tx === "string" ? row.mint_tx : null,
    created_at: toIso(row.created_at)
  };
}

export class SupabaseStorageRepository implements StorageRepository {
  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "sessions",
      body: {
        mode: input.mode,
        product: input.product,
        audience: input.audience,
        style_keywords: input.style_keywords,
        auto_continue: input.auto_continue,
        auto_pick_top1: input.auto_pick_top1,
        current_step: "interview_collect",
        status: "idle",
        paused: false,
        revision_count: 0
      }
    });
    return fromSessionRow(rows[0]);
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "sessions",
      query: {
        id: `eq.${sessionId}`,
        select: "*",
        limit: "1"
      }
    });
    return rows.length > 0 ? fromSessionRow(rows[0]) : null;
  }

  async updateSession(
    sessionId: string,
    patch: Partial<
      Pick<
        SessionRecord,
        | "constraint"
        | "current_step"
        | "status"
        | "auto_continue"
        | "auto_pick_top1"
        | "paused"
        | "intent_confidence"
        | "variation_width"
        | "latest_top3"
        | "selected_candidate_id"
        | "draft_spec"
        | "final_spec"
        | "revision_count"
      >
    >
  ): Promise<SessionRecord> {
    const rows = await requestRows<JsonMap>({
      method: "PATCH",
      path: "sessions",
      query: {
        id: `eq.${sessionId}`,
        select: "*"
      },
      body: {
        ...patch,
        updated_at: nowIso()
      }
    });
    if (rows.length === 0) {
      throw new Error(`Session not found for update: ${sessionId}`);
    }
    return fromSessionRow(rows[0]);
  }

  async appendMessage(input: {
    session_id: string;
    role: MessageRecord["role"];
    content: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<MessageRecord> {
    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "messages",
      body: {
        session_id: input.session_id,
        role: input.role,
        content: input.content,
        metadata: input.metadata ?? null
      }
    });
    return fromMessageRow(rows[0]);
  }

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "jobs",
      body: {
        session_id: input.session_id,
        step: input.step,
        status: "running",
        payload: input.payload ?? null,
        logs: []
      }
    });
    return fromJobRow(rows[0]);
  }

  async updateJob(
    jobId: string,
    patch: Partial<Pick<JobRecord, "status" | "logs" | "error" | "payload">>
  ): Promise<JobRecord> {
    const rows = await requestRows<JsonMap>({
      method: "PATCH",
      path: "jobs",
      query: {
        id: `eq.${jobId}`,
        select: "*"
      },
      body: {
        ...patch,
        updated_at: nowIso()
      }
    });
    if (rows.length === 0) {
      throw new Error(`Job not found for update: ${jobId}`);
    }
    return fromJobRow(rows[0]);
  }

  async listJobsBySession(sessionId: string): Promise<JobRecord[]> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "jobs",
      query: {
        session_id: `eq.${sessionId}`,
        select: "*",
        order: "created_at.desc"
      }
    });
    return rows.map(fromJobRow);
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "jobs",
      query: {
        id: `eq.${jobId}`,
        select: "*",
        limit: "1"
      }
    });
    return rows.length > 0 ? fromJobRow(rows[0]) : null;
  }

  async countActiveJobsBySession(sessionId: string): Promise<number> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "jobs",
      query: {
        session_id: `eq.${sessionId}`,
        status: "in.(pending,running)",
        select: "id"
      }
    });
    return rows.length;
  }

  async createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
    const hash = sha256(JSON.stringify(input.content));
    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "artifacts",
      body: {
        session_id: input.session_id,
        job_id: input.job_id ?? null,
        step: input.step,
        kind: input.kind,
        title: input.title,
        content: input.content,
        hash
      }
    });
    return fromArtifactRow(rows[0]);
  }

  async listArtifactsBySession(sessionId: string): Promise<ArtifactRecord[]> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "artifacts",
      query: {
        session_id: `eq.${sessionId}`,
        select: "*",
        order: "created_at.desc"
      }
    });
    return rows.map(fromArtifactRow);
  }

  async createPack(input: CreatePackInput): Promise<PackRecord> {
    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "packs",
      body: {
        session_id: input.session_id,
        meta: input.meta,
        bundle_hash: input.bundle_hash,
        cid: input.cid ?? null,
        mint_tx: input.mint_tx ?? null
      }
    });
    return fromPackRow(rows[0]);
  }

  async updatePack(
    packId: string,
    patch: Partial<Pick<PackRecord, "meta" | "bundle_hash" | "cid" | "mint_tx">>
  ): Promise<PackRecord> {
    const rows = await requestRows<JsonMap>({
      method: "PATCH",
      path: "packs",
      query: {
        id: `eq.${packId}`,
        select: "*"
      },
      body: patch
    });
    if (rows.length === 0) {
      throw new Error(`Pack not found for update: ${packId}`);
    }
    return fromPackRow(rows[0]);
  }

  async getPack(packId: string): Promise<PackRecord | null> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "packs",
      query: {
        id: `eq.${packId}`,
        select: "*",
        limit: "1"
      }
    });
    return rows.length > 0 ? fromPackRow(rows[0]) : null;
  }

  async trackUsage(input: { session_id: string; type: string; amount: number }): Promise<void> {
    await requestRows<JsonMap>({
      method: "POST",
      path: "usage",
      prefer: "return=minimal",
      body: {
        session_id: input.session_id,
        type: input.type,
        amount: input.amount
      }
    });
  }
}
