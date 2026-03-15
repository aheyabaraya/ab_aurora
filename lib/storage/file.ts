import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
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
import { createId } from "../utils/id";
import { sha256 } from "../utils/hash";
import type {
  CreateArtifactInput,
  CreateJobInput,
  CreatePackInput,
  CreateSessionInput,
  StorageRepository,
  UsageSummary
} from "./types";

type DbShape = {
  sessions: SessionRecord[];
  messages: MessageRecord[];
  jobs: JobRecord[];
  artifacts: ArtifactRecord[];
  packs: PackRecord[];
  runtime_goals: RuntimeGoalRecord[];
  runtime_plans: RuntimePlanRecord[];
  runtime_actions: RuntimeActionRecord[];
  runtime_tool_calls: RuntimeToolCallRecord[];
  runtime_evals: RuntimeEvalRecord[];
  runtime_memories: RuntimeMemoryRecord[];
  runtime_events: RuntimeEventRecord[];
  usage: Array<{
    session_id: string;
    type: string;
    amount: number;
    created_at: string;
  }>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeDataDir(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }
  return normalized;
}

function isServerlessRuntime(rawEnv: NodeJS.ProcessEnv): boolean {
  return (
    rawEnv.VERCEL === "1" ||
    typeof rawEnv.AWS_LAMBDA_FUNCTION_NAME === "string" ||
    typeof rawEnv.LAMBDA_TASK_ROOT === "string"
  );
}

export function resolveFileStorageRuntimeDir(
  rawEnv: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): string {
  const customBaseDir = normalizeDataDir(rawEnv.AB_AURORA_DATA_DIR);
  if (customBaseDir) {
    return join(customBaseDir, "runtime");
  }
  if (isServerlessRuntime(rawEnv)) {
    return join(tmpdir(), "ab_aurora", ".data", "runtime");
  }
  return join(cwd, ".data", "runtime");
}

const tmpFallbackRuntimeDir = join(tmpdir(), "ab_aurora", ".data", "runtime");
let runtimeDir = resolveFileStorageRuntimeDir();
let runtimeFile = join(runtimeDir, "db.json");

function setRuntimeDir(nextRuntimeDir: string): void {
  runtimeDir = nextRuntimeDir;
  runtimeFile = join(runtimeDir, "db.json");
}

function ensureRuntimeFile() {
  const initializeRuntimeFile = () => {
    mkdirSync(runtimeDir, { recursive: true });
    try {
      readFileSync(runtimeFile, "utf8");
    } catch {
      const initial: DbShape = {
        sessions: [],
        messages: [],
        jobs: [],
        artifacts: [],
        packs: [],
        runtime_goals: [],
        runtime_plans: [],
        runtime_actions: [],
        runtime_tool_calls: [],
        runtime_evals: [],
        runtime_memories: [],
        runtime_events: [],
        usage: []
      };
      writeFileSync(runtimeFile, JSON.stringify(initial), "utf8");
    }
  };

  try {
    initializeRuntimeFile();
  } catch {
    if (runtimeDir === tmpFallbackRuntimeDir) {
      throw new Error(`Failed to initialize file storage at fallback path: ${tmpFallbackRuntimeDir}`);
    }
    setRuntimeDir(tmpFallbackRuntimeDir);
    initializeRuntimeFile();
  }
}

function loadDb(): DbShape {
  ensureRuntimeFile();
  const text = readFileSync(runtimeFile, "utf8");
  const parsed = JSON.parse(text) as Partial<DbShape>;
  return {
    sessions: (parsed.sessions ?? []).map((session) => ({
      ...session,
      owner_user_id: typeof session.owner_user_id === "string" ? session.owner_user_id : null
    })),
    messages: parsed.messages ?? [],
    jobs: parsed.jobs ?? [],
    artifacts: parsed.artifacts ?? [],
    packs: parsed.packs ?? [],
    runtime_goals: parsed.runtime_goals ?? [],
    runtime_plans: parsed.runtime_plans ?? [],
    runtime_actions: parsed.runtime_actions ?? [],
    runtime_tool_calls: parsed.runtime_tool_calls ?? [],
    runtime_evals: parsed.runtime_evals ?? [],
    runtime_memories: parsed.runtime_memories ?? [],
    runtime_events: parsed.runtime_events ?? [],
    usage: parsed.usage ?? []
  };
}

function saveDb(db: DbShape): void {
  ensureRuntimeFile();
  writeFileSync(runtimeFile, JSON.stringify(db), "utf8");
}

function descByCreatedAt<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => (left.created_at < right.created_at ? 1 : -1));
}

function toVariationWidthFromScore(
  score: number | undefined
): SessionRecord["variation_width"] {
  if (typeof score !== "number") {
    return null;
  }
  if (score <= 2) {
    return "wide";
  }
  if (score === 3) {
    return "medium";
  }
  return "narrow";
}

export class FileStorageRepository implements StorageRepository {
  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const db = loadDb();
    const timestamp = nowIso();
    const session: SessionRecord = {
      id: createId("sess"),
      owner_user_id: input.owner_user_id ?? null,
      mode: input.mode,
      product: input.product,
      audience: input.audience,
      style_keywords: input.style_keywords,
      constraint: input.design_direction_note?.trim() ? input.design_direction_note.trim() : null,
      current_step: "interview_collect",
      status: "idle",
      auto_continue: input.auto_continue,
      auto_pick_top1: input.auto_pick_top1,
      paused: false,
      intent_confidence: input.q0_intent_confidence ?? null,
      variation_width: toVariationWidthFromScore(input.q0_intent_confidence),
      latest_top3: null,
      selected_candidate_id: null,
      draft_spec: null,
      final_spec: null,
      revision_count: 0,
      created_at: timestamp,
      updated_at: timestamp
    };
    db.sessions.push(session);
    saveDb(db);
    return session;
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const db = loadDb();
    return db.sessions.find((session) => session.id === sessionId) ?? null;
  }

  async updateSession(sessionId: string, patch: Partial<SessionRecord>): Promise<SessionRecord> {
    const db = loadDb();
    const index = db.sessions.findIndex((session) => session.id === sessionId);
    if (index < 0) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const next = {
      ...db.sessions[index],
      ...patch,
      updated_at: nowIso()
    };
    db.sessions[index] = next;
    saveDb(db);
    return next;
  }

  async appendMessage(input: {
    session_id: string;
    role: MessageRecord["role"];
    content: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<MessageRecord> {
    const db = loadDb();
    const message: MessageRecord = {
      id: createId("msg"),
      session_id: input.session_id,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? null,
      created_at: nowIso()
    };
    db.messages.push(message);
    saveDb(db);
    return message;
  }

  async listMessagesBySession(sessionId: string, limit = 50): Promise<MessageRecord[]> {
    const db = loadDb();
    return descByCreatedAt(db.messages.filter((message) => message.session_id === sessionId)).slice(0, limit);
  }

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    const db = loadDb();
    const job: JobRecord = {
      id: createId("job"),
      session_id: input.session_id,
      step: input.step,
      status: "running",
      payload: input.payload ?? null,
      logs: [],
      error: null,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    db.jobs.push(job);
    saveDb(db);
    return job;
  }

  async updateJob(
    jobId: string,
    patch: Partial<Pick<JobRecord, "status" | "logs" | "error" | "payload">>
  ): Promise<JobRecord> {
    const db = loadDb();
    const index = db.jobs.findIndex((job) => job.id === jobId);
    if (index < 0) {
      throw new Error(`Job not found: ${jobId}`);
    }
    const next = {
      ...db.jobs[index],
      ...patch,
      updated_at: nowIso()
    };
    db.jobs[index] = next;
    saveDb(db);
    return next;
  }

  async listJobsBySession(sessionId: string): Promise<JobRecord[]> {
    const db = loadDb();
    return descByCreatedAt(db.jobs.filter((job) => job.session_id === sessionId));
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    const db = loadDb();
    return db.jobs.find((job) => job.id === jobId) ?? null;
  }

  async countActiveJobsBySession(sessionId: string): Promise<number> {
    const db = loadDb();
    return db.jobs.filter(
      (job) => job.session_id === sessionId && (job.status === "pending" || job.status === "running")
    ).length;
  }

  async createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
    const db = loadDb();
    const artifact: ArtifactRecord = {
      id: createId("art"),
      session_id: input.session_id,
      job_id: input.job_id ?? null,
      step: input.step,
      kind: input.kind,
      title: input.title,
      content: input.content,
      hash: sha256(JSON.stringify(input.content)),
      created_at: nowIso()
    };
    db.artifacts.push(artifact);
    saveDb(db);
    return artifact;
  }

  async listArtifactsBySession(sessionId: string): Promise<ArtifactRecord[]> {
    const db = loadDb();
    return descByCreatedAt(db.artifacts.filter((artifact) => artifact.session_id === sessionId));
  }

  async createPack(input: CreatePackInput): Promise<PackRecord> {
    const db = loadDb();
    const pack: PackRecord = {
      id: createId("pack"),
      session_id: input.session_id,
      meta: input.meta,
      bundle_hash: input.bundle_hash,
      cid: input.cid ?? null,
      mint_tx: input.mint_tx ?? null,
      created_at: nowIso()
    };
    db.packs.push(pack);
    saveDb(db);
    return pack;
  }

  async updatePack(
    packId: string,
    patch: Partial<Pick<PackRecord, "meta" | "bundle_hash" | "cid" | "mint_tx">>
  ): Promise<PackRecord> {
    const db = loadDb();
    const index = db.packs.findIndex((pack) => pack.id === packId);
    if (index < 0) {
      throw new Error(`Pack not found: ${packId}`);
    }
    const next = {
      ...db.packs[index],
      ...patch
    };
    db.packs[index] = next;
    saveDb(db);
    return next;
  }

  async getPack(packId: string): Promise<PackRecord | null> {
    const db = loadDb();
    return db.packs.find((pack) => pack.id === packId) ?? null;
  }

  async trackUsage(input: { session_id: string; type: string; amount: number }): Promise<void> {
    const db = loadDb();
    db.usage.push({
      session_id: input.session_id,
      type: input.type,
      amount: input.amount,
      created_at: nowIso()
    });
    saveDb(db);
    return;
  }

  async getUsageSummaryBySession(sessionId: string): Promise<UsageSummary> {
    const db = loadDb();
    const byType: Record<string, number> = {};
    for (const entry of db.usage) {
      if (entry.session_id !== sessionId) {
        continue;
      }
      byType[entry.type] = (byType[entry.type] ?? 0) + entry.amount;
    }
    const total = Object.values(byType).reduce((sum, value) => sum + value, 0);
    return {
      total,
      by_type: byType
    };
  }

  async createRuntimeGoal(input: {
    session_id: string;
    goal_type: RuntimeGoalRecord["goal_type"];
    goal_input?: Record<string, unknown> | null;
    idempotency_key?: string | null;
  }): Promise<RuntimeGoalRecord> {
    const db = loadDb();
    const timestamp = nowIso();
    const goal: RuntimeGoalRecord = {
      id: createId("rt_goal"),
      session_id: input.session_id,
      goal_type: input.goal_type,
      goal_input: input.goal_input ?? null,
      status: "pending",
      current_plan_id: null,
      current_step_no: 0,
      last_action_id: null,
      last_eval_id: null,
      idempotency_key: input.idempotency_key ?? null,
      error: null,
      created_at: timestamp,
      updated_at: timestamp
    };
    db.runtime_goals.push(goal);
    saveDb(db);
    return goal;
  }

  async getRuntimeGoal(goalId: string): Promise<RuntimeGoalRecord | null> {
    const db = loadDb();
    return db.runtime_goals.find((goal) => goal.id === goalId) ?? null;
  }

  async findRuntimeGoalByIdempotency(idempotencyKey: string): Promise<RuntimeGoalRecord | null> {
    const db = loadDb();
    return db.runtime_goals.find((goal) => goal.idempotency_key === idempotencyKey) ?? null;
  }

  async findActiveRuntimeGoal(
    sessionId: string,
    goalType: RuntimeGoalRecord["goal_type"]
  ): Promise<RuntimeGoalRecord | null> {
    const db = loadDb();
    return (
      db.runtime_goals.find(
        (goal) =>
          goal.session_id === sessionId &&
          goal.goal_type === goalType &&
          (goal.status === "pending" || goal.status === "running" || goal.status === "wait_user")
      ) ?? null
    );
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
    const db = loadDb();
    const index = db.runtime_goals.findIndex((goal) => goal.id === goalId);
    if (index < 0) {
      throw new Error(`Runtime goal not found: ${goalId}`);
    }
    const next = {
      ...db.runtime_goals[index],
      ...patch,
      updated_at: nowIso()
    };
    db.runtime_goals[index] = next;
    saveDb(db);
    return next;
  }

  async listRuntimeGoalsBySession(sessionId: string): Promise<RuntimeGoalRecord[]> {
    const db = loadDb();
    return descByCreatedAt(db.runtime_goals.filter((goal) => goal.session_id === sessionId));
  }

  async createRuntimePlan(input: RuntimePlanInput): Promise<RuntimePlanRecord> {
    const db = loadDb();
    const timestamp = nowIso();
    const plan: RuntimePlanRecord = {
      id: createId("rt_plan"),
      goal_id: input.goal_id,
      version: input.version,
      rationale: input.rationale,
      proposed_actions: input.proposed_actions,
      stop_condition: input.stop_condition,
      status: input.status ?? "active",
      created_at: timestamp,
      updated_at: timestamp
    };
    db.runtime_plans.push(plan);
    saveDb(db);
    return plan;
  }

  async listRuntimePlansByGoal(goalId: string): Promise<RuntimePlanRecord[]> {
    const db = loadDb();
    return descByCreatedAt(db.runtime_plans.filter((plan) => plan.goal_id === goalId));
  }

  async createRuntimeAction(input: RuntimeActionInput): Promise<RuntimeActionRecord> {
    const db = loadDb();
    const timestamp = nowIso();
    const action: RuntimeActionRecord = {
      id: createId("rt_act"),
      goal_id: input.goal_id,
      plan_id: input.plan_id,
      step_no: input.step_no,
      action_type: input.action_type,
      tool_name: input.tool_name,
      action_input: input.action_input,
      policy_result: input.policy_result ?? null,
      status: input.status ?? "pending",
      idempotency_key: input.idempotency_key ?? null,
      output: null,
      error: null,
      created_at: timestamp,
      updated_at: timestamp,
      finished_at: null
    };
    db.runtime_actions.push(action);
    saveDb(db);
    return action;
  }

  async getRuntimeActionByIdempotency(
    goalId: string,
    idempotencyKey: string
  ): Promise<RuntimeActionRecord | null> {
    const db = loadDb();
    return (
      db.runtime_actions.find(
        (action) => action.goal_id === goalId && action.idempotency_key === idempotencyKey
      ) ?? null
    );
  }

  async updateRuntimeAction(
    actionId: string,
    patch: Partial<
      Pick<RuntimeActionRecord, "status" | "policy_result" | "error" | "output" | "finished_at">
    >
  ): Promise<RuntimeActionRecord> {
    const db = loadDb();
    const index = db.runtime_actions.findIndex((action) => action.id === actionId);
    if (index < 0) {
      throw new Error(`Runtime action not found: ${actionId}`);
    }
    const next = {
      ...db.runtime_actions[index],
      ...patch,
      updated_at: nowIso()
    };
    db.runtime_actions[index] = next;
    saveDb(db);
    return next;
  }

  async listRuntimeActionsByGoal(goalId: string): Promise<RuntimeActionRecord[]> {
    const db = loadDb();
    return descByCreatedAt(db.runtime_actions.filter((action) => action.goal_id === goalId));
  }

  async createRuntimeToolCall(input: RuntimeToolCallInput): Promise<RuntimeToolCallRecord> {
    const db = loadDb();
    const call: RuntimeToolCallRecord = {
      id: createId("rt_tool"),
      goal_id: input.goal_id,
      action_id: input.action_id,
      tool_name: input.tool_name,
      input: input.input,
      output: input.output,
      status: input.status,
      latency_ms: input.latency_ms,
      error: input.error,
      created_at: nowIso()
    };
    db.runtime_tool_calls.push(call);
    saveDb(db);
    return call;
  }

  async listRuntimeToolCallsByGoal(goalId: string): Promise<RuntimeToolCallRecord[]> {
    const db = loadDb();
    return descByCreatedAt(db.runtime_tool_calls.filter((call) => call.goal_id === goalId));
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
    const db = loadDb();
    const evaluation: RuntimeEvalRecord = {
      id: createId("rt_eval"),
      goal_id: input.goal_id,
      plan_id: input.plan_id,
      action_id: input.action_id,
      scores: input.scores,
      pass: input.pass,
      reasons: input.reasons,
      next_hint: input.next_hint,
      created_at: nowIso()
    };
    db.runtime_evals.push(evaluation);
    saveDb(db);
    return evaluation;
  }

  async listRuntimeEvalsByGoal(goalId: string): Promise<RuntimeEvalRecord[]> {
    const db = loadDb();
    return descByCreatedAt(db.runtime_evals.filter((evaluation) => evaluation.goal_id === goalId));
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
    const db = loadDb();
    const index = db.runtime_memories.findIndex(
      (memory) =>
        memory.scope === input.scope &&
        memory.session_id === input.session_id &&
        memory.brand_key === input.brand_key &&
        memory.memory_key === input.memory_key
    );
    if (index >= 0) {
      const next = {
        ...db.runtime_memories[index],
        memory_value: input.memory_value,
        weight: input.weight,
        source_action_id: input.source_action_id,
        updated_at: nowIso()
      };
      db.runtime_memories[index] = next;
      saveDb(db);
      return next;
    }

    const timestamp = nowIso();
    const memory: RuntimeMemoryRecord = {
      id: createId("rt_mem"),
      scope: input.scope,
      session_id: input.session_id,
      brand_key: input.brand_key,
      memory_key: input.memory_key,
      memory_value: input.memory_value,
      weight: input.weight,
      source_action_id: input.source_action_id,
      created_at: timestamp,
      updated_at: timestamp
    };
    db.runtime_memories.push(memory);
    saveDb(db);
    return memory;
  }

  async listRuntimeMemories(input: {
    scope?: RuntimeMemoryRecord["scope"];
    session_id?: string;
    brand_key?: string;
  }): Promise<RuntimeMemoryRecord[]> {
    const db = loadDb();
    const filtered = db.runtime_memories.filter((memory) => {
      if (input.scope && memory.scope !== input.scope) {
        return false;
      }
      if (input.session_id && memory.session_id !== input.session_id) {
        return false;
      }
      if (input.brand_key && memory.brand_key !== input.brand_key) {
        return false;
      }
      return true;
    });
    return descByCreatedAt(filtered);
  }

  async createRuntimeEvent(input: {
    session_id: string;
    goal_id: string;
    event_type: RuntimeEventRecord["event_type"];
    payload: Record<string, unknown>;
  }): Promise<RuntimeEventRecord> {
    const db = loadDb();
    const event: RuntimeEventRecord = {
      id: createId("rt_evt"),
      session_id: input.session_id,
      goal_id: input.goal_id,
      event_type: input.event_type,
      payload: input.payload,
      created_at: nowIso()
    };
    db.runtime_events.push(event);
    saveDb(db);
    return event;
  }

  async listRuntimeEventsByGoal(goalId: string): Promise<RuntimeEventRecord[]> {
    const db = loadDb();
    return descByCreatedAt(db.runtime_events.filter((event) => event.goal_id === goalId));
  }
}
