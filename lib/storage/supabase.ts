import { env } from "../env";
import type {
  ArtifactRecord,
  JobRecord,
  MessageRecord,
  PackRecord,
  SessionRecord
} from "../agent/types";
import type {
  RuntimeActionInput,
  RuntimeActionRecord,
  RuntimeEvalRecord,
  RuntimeEventRecord,
  RuntimeGoalRecord,
  RuntimeMemoryRecord,
  RuntimePlanInput,
  RuntimePlanRecord,
  RuntimeToolCallInput,
  RuntimeToolCallRecord
} from "../runtime/types";
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
    owner_user_id: typeof row.owner_user_id === "string" ? row.owner_user_id : null,
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

function asActionSpecs(value: unknown): RuntimePlanRecord["proposed_actions"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as RuntimePlanRecord["proposed_actions"];
}

function asNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
      .map(([key, numberValue]) => [key, numberValue])
  );
}

function fromRuntimeGoalRow(row: JsonMap): RuntimeGoalRecord {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    goal_type: (row.goal_type as RuntimeGoalRecord["goal_type"]) ?? "deliver_demo_pack",
    goal_input: row.goal_input ? assertObject(row.goal_input) : null,
    status: (row.status as RuntimeGoalRecord["status"]) ?? "pending",
    current_plan_id: typeof row.current_plan_id === "string" ? row.current_plan_id : null,
    current_step_no:
      typeof row.current_step_no === "number" ? row.current_step_no : Number(row.current_step_no ?? 0),
    last_action_id: typeof row.last_action_id === "string" ? row.last_action_id : null,
    last_eval_id: typeof row.last_eval_id === "string" ? row.last_eval_id : null,
    idempotency_key: typeof row.idempotency_key === "string" ? row.idempotency_key : null,
    error: typeof row.error === "string" ? row.error : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

function fromRuntimePlanRow(row: JsonMap): RuntimePlanRecord {
  return {
    id: String(row.id),
    goal_id: String(row.goal_id),
    version: typeof row.version === "number" ? row.version : Number(row.version ?? 1),
    rationale: String(row.rationale ?? ""),
    proposed_actions: asActionSpecs(row.proposed_actions),
    stop_condition: String(row.stop_condition ?? ""),
    status: (row.status as RuntimePlanRecord["status"]) ?? "active",
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

function fromRuntimeActionRow(row: JsonMap): RuntimeActionRecord {
  return {
    id: String(row.id),
    goal_id: String(row.goal_id),
    plan_id: typeof row.plan_id === "string" ? row.plan_id : null,
    step_no: typeof row.step_no === "number" ? row.step_no : Number(row.step_no ?? 0),
    action_type: String(row.action_type ?? ""),
    tool_name: String(row.tool_name ?? ""),
    action_input: assertObject(row.action_input),
    policy_result:
      row.policy_result === "allow" || row.policy_result === "deny" || row.policy_result === "confirm_required"
        ? row.policy_result
        : null,
    status: (row.status as RuntimeActionRecord["status"]) ?? "pending",
    idempotency_key: typeof row.idempotency_key === "string" ? row.idempotency_key : null,
    output: row.output ? assertObject(row.output) : null,
    error: typeof row.error === "string" ? row.error : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    finished_at: typeof row.finished_at === "string" ? row.finished_at : null
  };
}

function fromRuntimeToolCallRow(row: JsonMap): RuntimeToolCallRecord {
  return {
    id: String(row.id),
    goal_id: String(row.goal_id),
    action_id: String(row.action_id),
    tool_name: String(row.tool_name ?? ""),
    input: assertObject(row.input),
    output: row.output ? assertObject(row.output) : null,
    status: (row.status as RuntimeToolCallRecord["status"]) ?? "completed",
    latency_ms: typeof row.latency_ms === "number" ? row.latency_ms : Number(row.latency_ms ?? 0),
    error: typeof row.error === "string" ? row.error : null,
    created_at: toIso(row.created_at)
  };
}

function fromRuntimeEvalRow(row: JsonMap): RuntimeEvalRecord {
  return {
    id: String(row.id),
    goal_id: String(row.goal_id),
    plan_id: typeof row.plan_id === "string" ? row.plan_id : null,
    action_id: typeof row.action_id === "string" ? row.action_id : null,
    scores: asNumberRecord(row.scores),
    pass: Boolean(row.pass),
    reasons: asStringArray(row.reasons),
    next_hint: typeof row.next_hint === "string" ? row.next_hint : null,
    created_at: toIso(row.created_at)
  };
}

function fromRuntimeMemoryRow(row: JsonMap): RuntimeMemoryRecord {
  return {
    id: String(row.id),
    scope: (row.scope as RuntimeMemoryRecord["scope"]) ?? "session",
    session_id: typeof row.session_id === "string" ? row.session_id : null,
    brand_key: typeof row.brand_key === "string" ? row.brand_key : null,
    memory_key: String(row.memory_key ?? ""),
    memory_value: assertObject(row.memory_value),
    weight: typeof row.weight === "number" ? row.weight : Number(row.weight ?? 0),
    source_action_id: typeof row.source_action_id === "string" ? row.source_action_id : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

function fromRuntimeEventRow(row: JsonMap): RuntimeEventRecord {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    goal_id: String(row.goal_id),
    event_type: (row.event_type as RuntimeEventRecord["event_type"]) ?? "goal_created",
    payload: assertObject(row.payload),
    created_at: toIso(row.created_at)
  };
}

export class SupabaseStorageRepository implements StorageRepository {
  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const variationWidth =
      typeof input.q0_intent_confidence === "number"
        ? input.q0_intent_confidence <= 2
          ? "wide"
          : input.q0_intent_confidence === 3
            ? "medium"
            : "narrow"
        : null;
    const sessionInsert: JsonMap = {
      mode: input.mode,
      owner_user_id: input.owner_user_id ?? null,
      product: input.product,
      audience: input.audience,
      style_keywords: input.style_keywords,
      constraint: input.design_direction_note?.trim() ? input.design_direction_note.trim() : null,
      intent_confidence: input.q0_intent_confidence ?? null,
      variation_width: variationWidth,
      auto_continue: input.auto_continue,
      auto_pick_top1: input.auto_pick_top1,
      current_step: "interview_collect",
      status: "idle",
      paused: false,
      revision_count: 0
    };

    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "sessions",
      body: sessionInsert
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

  async listMessagesBySession(sessionId: string, limit = 50): Promise<MessageRecord[]> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "messages",
      query: {
        session_id: `eq.${sessionId}`,
        select: "*",
        order: "created_at.desc",
        limit: String(limit)
      }
    });
    return rows.map(fromMessageRow);
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

  async createRuntimeGoal(input: {
    session_id: string;
    goal_type: RuntimeGoalRecord["goal_type"];
    goal_input?: Record<string, unknown> | null;
    idempotency_key?: string | null;
  }): Promise<RuntimeGoalRecord> {
    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "runtime_goals",
      body: {
        session_id: input.session_id,
        goal_type: input.goal_type,
        goal_input: input.goal_input ?? null,
        status: "pending",
        current_step_no: 0,
        idempotency_key: input.idempotency_key ?? null
      }
    });
    return fromRuntimeGoalRow(rows[0]);
  }

  async getRuntimeGoal(goalId: string): Promise<RuntimeGoalRecord | null> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "runtime_goals",
      query: {
        id: `eq.${goalId}`,
        select: "*",
        limit: "1"
      }
    });
    return rows.length > 0 ? fromRuntimeGoalRow(rows[0]) : null;
  }

  async findRuntimeGoalByIdempotency(idempotencyKey: string): Promise<RuntimeGoalRecord | null> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "runtime_goals",
      query: {
        idempotency_key: `eq.${idempotencyKey}`,
        select: "*",
        order: "created_at.desc",
        limit: "1"
      }
    });
    return rows.length > 0 ? fromRuntimeGoalRow(rows[0]) : null;
  }

  async findActiveRuntimeGoal(
    sessionId: string,
    goalType: RuntimeGoalRecord["goal_type"]
  ): Promise<RuntimeGoalRecord | null> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "runtime_goals",
      query: {
        session_id: `eq.${sessionId}`,
        goal_type: `eq.${goalType}`,
        status: "in.(pending,running,wait_user)",
        select: "*",
        order: "created_at.desc",
        limit: "1"
      }
    });
    return rows.length > 0 ? fromRuntimeGoalRow(rows[0]) : null;
  }

  async updateRuntimeGoal(
    goalId: string,
    patch: Partial<
      Pick<
        RuntimeGoalRecord,
        "status" | "current_plan_id" | "current_step_no" | "last_action_id" | "last_eval_id" | "error"
      >
    >
  ): Promise<RuntimeGoalRecord> {
    const rows = await requestRows<JsonMap>({
      method: "PATCH",
      path: "runtime_goals",
      query: {
        id: `eq.${goalId}`,
        select: "*"
      },
      body: {
        ...patch,
        updated_at: nowIso()
      }
    });
    if (rows.length === 0) {
      throw new Error(`Runtime goal not found: ${goalId}`);
    }
    return fromRuntimeGoalRow(rows[0]);
  }

  async listRuntimeGoalsBySession(sessionId: string): Promise<RuntimeGoalRecord[]> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "runtime_goals",
      query: {
        session_id: `eq.${sessionId}`,
        select: "*",
        order: "created_at.desc"
      }
    });
    return rows.map(fromRuntimeGoalRow);
  }

  async createRuntimePlan(input: RuntimePlanInput): Promise<RuntimePlanRecord> {
    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "runtime_plans",
      body: {
        goal_id: input.goal_id,
        version: input.version,
        rationale: input.rationale,
        proposed_actions: input.proposed_actions,
        stop_condition: input.stop_condition,
        status: input.status ?? "active"
      }
    });
    return fromRuntimePlanRow(rows[0]);
  }

  async listRuntimePlansByGoal(goalId: string): Promise<RuntimePlanRecord[]> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "runtime_plans",
      query: {
        goal_id: `eq.${goalId}`,
        select: "*",
        order: "version.desc"
      }
    });
    return rows.map(fromRuntimePlanRow);
  }

  async createRuntimeAction(input: RuntimeActionInput): Promise<RuntimeActionRecord> {
    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "runtime_actions",
      body: {
        goal_id: input.goal_id,
        plan_id: input.plan_id,
        step_no: input.step_no,
        action_type: input.action_type,
        tool_name: input.tool_name,
        action_input: input.action_input,
        policy_result: input.policy_result ?? null,
        status: input.status ?? "pending",
        idempotency_key: input.idempotency_key ?? null
      }
    });
    return fromRuntimeActionRow(rows[0]);
  }

  async getRuntimeActionByIdempotency(
    goalId: string,
    idempotencyKey: string
  ): Promise<RuntimeActionRecord | null> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "runtime_actions",
      query: {
        goal_id: `eq.${goalId}`,
        idempotency_key: `eq.${idempotencyKey}`,
        select: "*",
        order: "created_at.desc",
        limit: "1"
      }
    });
    return rows.length > 0 ? fromRuntimeActionRow(rows[0]) : null;
  }

  async updateRuntimeAction(
    actionId: string,
    patch: Partial<
      Pick<RuntimeActionRecord, "status" | "policy_result" | "error" | "output" | "finished_at">
    >
  ): Promise<RuntimeActionRecord> {
    const rows = await requestRows<JsonMap>({
      method: "PATCH",
      path: "runtime_actions",
      query: {
        id: `eq.${actionId}`,
        select: "*"
      },
      body: {
        ...patch,
        updated_at: nowIso()
      }
    });
    if (rows.length === 0) {
      throw new Error(`Runtime action not found: ${actionId}`);
    }
    return fromRuntimeActionRow(rows[0]);
  }

  async listRuntimeActionsByGoal(goalId: string): Promise<RuntimeActionRecord[]> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "runtime_actions",
      query: {
        goal_id: `eq.${goalId}`,
        select: "*",
        order: "step_no.asc"
      }
    });
    return rows.map(fromRuntimeActionRow);
  }

  async createRuntimeToolCall(input: RuntimeToolCallInput): Promise<RuntimeToolCallRecord> {
    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "runtime_tool_calls",
      body: {
        goal_id: input.goal_id,
        action_id: input.action_id,
        tool_name: input.tool_name,
        input: input.input,
        output: input.output,
        status: input.status,
        latency_ms: input.latency_ms,
        error: input.error
      }
    });
    return fromRuntimeToolCallRow(rows[0]);
  }

  async listRuntimeToolCallsByGoal(goalId: string): Promise<RuntimeToolCallRecord[]> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "runtime_tool_calls",
      query: {
        goal_id: `eq.${goalId}`,
        select: "*",
        order: "created_at.desc"
      }
    });
    return rows.map(fromRuntimeToolCallRow);
  }

  async createRuntimeEval(input: {
    goal_id: string;
    plan_id: string | null;
    action_id: string | null;
    scores: Record<string, number>;
    pass: boolean;
    reasons: string[];
    next_hint: string | null;
  }): Promise<RuntimeEvalRecord> {
    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "runtime_evals",
      body: {
        goal_id: input.goal_id,
        plan_id: input.plan_id,
        action_id: input.action_id,
        scores: input.scores,
        pass: input.pass,
        reasons: input.reasons,
        next_hint: input.next_hint
      }
    });
    return fromRuntimeEvalRow(rows[0]);
  }

  async listRuntimeEvalsByGoal(goalId: string): Promise<RuntimeEvalRecord[]> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "runtime_evals",
      query: {
        goal_id: `eq.${goalId}`,
        select: "*",
        order: "created_at.desc"
      }
    });
    return rows.map(fromRuntimeEvalRow);
  }

  async upsertRuntimeMemory(input: {
    scope: RuntimeMemoryRecord["scope"];
    session_id: string | null;
    brand_key: string | null;
    memory_key: string;
    memory_value: Record<string, unknown>;
    weight: number;
    source_action_id: string | null;
  }): Promise<RuntimeMemoryRecord> {
    const sessionFilter = input.session_id ? `eq.${input.session_id}` : "is.null";
    const brandFilter = input.brand_key ? `eq.${input.brand_key}` : "is.null";
    const existingRows = await requestRows<JsonMap>({
      method: "GET",
      path: "runtime_memories",
      query: {
        scope: `eq.${input.scope}`,
        session_id: sessionFilter,
        brand_key: brandFilter,
        memory_key: `eq.${input.memory_key}`,
        select: "*",
        limit: "1"
      }
    });

    if (existingRows.length > 0) {
      const existing = fromRuntimeMemoryRow(existingRows[0]);
      const updatedRows = await requestRows<JsonMap>({
        method: "PATCH",
        path: "runtime_memories",
        query: {
          id: `eq.${existing.id}`,
          select: "*"
        },
        body: {
          memory_value: input.memory_value,
          weight: input.weight,
          source_action_id: input.source_action_id,
          updated_at: nowIso()
        }
      });
      return fromRuntimeMemoryRow(updatedRows[0]);
    }

    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "runtime_memories",
      body: {
        scope: input.scope,
        session_id: input.session_id,
        brand_key: input.brand_key,
        memory_key: input.memory_key,
        memory_value: input.memory_value,
        weight: input.weight,
        source_action_id: input.source_action_id
      }
    });
    return fromRuntimeMemoryRow(rows[0]);
  }

  async listRuntimeMemories(input: {
    scope?: RuntimeMemoryRecord["scope"];
    session_id?: string;
    brand_key?: string;
  }): Promise<RuntimeMemoryRecord[]> {
    const query: Record<string, string> = {
      select: "*",
      order: "updated_at.desc"
    };
    if (input.scope) {
      query.scope = `eq.${input.scope}`;
    }
    if (input.session_id) {
      query.session_id = `eq.${input.session_id}`;
    }
    if (input.brand_key) {
      query.brand_key = `eq.${input.brand_key}`;
    }
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "runtime_memories",
      query
    });
    return rows.map(fromRuntimeMemoryRow);
  }

  async createRuntimeEvent(input: {
    session_id: string;
    goal_id: string;
    event_type: RuntimeEventRecord["event_type"];
    payload: Record<string, unknown>;
  }): Promise<RuntimeEventRecord> {
    const rows = await requestRows<JsonMap>({
      method: "POST",
      path: "runtime_events",
      body: {
        session_id: input.session_id,
        goal_id: input.goal_id,
        event_type: input.event_type,
        payload: input.payload
      }
    });
    return fromRuntimeEventRow(rows[0]);
  }

  async listRuntimeEventsByGoal(goalId: string): Promise<RuntimeEventRecord[]> {
    const rows = await requestRows<JsonMap>({
      method: "GET",
      path: "runtime_events",
      query: {
        goal_id: `eq.${goalId}`,
        select: "*",
        order: "created_at.desc"
      }
    });
    return rows.map(fromRuntimeEventRow);
  }
}
