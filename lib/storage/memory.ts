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
  StorageRepository
} from "./types";

const sessions = new Map<string, SessionRecord>();
const messages = new Map<string, MessageRecord[]>();
const jobs = new Map<string, JobRecord>();
const artifacts = new Map<string, ArtifactRecord[]>();
const packs = new Map<string, PackRecord>();
const runtimeGoals = new Map<string, RuntimeGoalRecord>();
const runtimePlans = new Map<string, RuntimePlanRecord>();
const runtimeActions = new Map<string, RuntimeActionRecord>();
const runtimeToolCalls = new Map<string, RuntimeToolCallRecord>();
const runtimeEvals = new Map<string, RuntimeEvalRecord>();
const runtimeMemories = new Map<string, RuntimeMemoryRecord>();
const runtimeEvents = new Map<string, RuntimeEventRecord>();

function nowIso(): string {
  return new Date().toISOString();
}

function descByCreatedAt<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => (left.created_at < right.created_at ? 1 : -1));
}

export class MemoryStorageRepository implements StorageRepository {
  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const timestamp = nowIso();
    const session: SessionRecord = {
      id: createId("sess"),
      mode: input.mode,
      product: input.product,
      audience: input.audience,
      style_keywords: input.style_keywords,
      constraint: null,
      current_step: "interview_collect",
      status: "idle",
      auto_continue: input.auto_continue,
      auto_pick_top1: input.auto_pick_top1,
      paused: false,
      intent_confidence: null,
      variation_width: null,
      latest_top3: null,
      selected_candidate_id: null,
      draft_spec: null,
      final_spec: null,
      revision_count: 0,
      created_at: timestamp,
      updated_at: timestamp
    };
    sessions.set(session.id, session);
    messages.set(session.id, []);
    artifacts.set(session.id, []);
    return session;
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return sessions.get(sessionId) ?? null;
  }

  async updateSession(sessionId: string, patch: Partial<SessionRecord>): Promise<SessionRecord> {
    const current = sessions.get(sessionId);
    if (!current) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const next: SessionRecord = {
      ...current,
      ...patch,
      updated_at: nowIso()
    };
    sessions.set(sessionId, next);
    return next;
  }

  async appendMessage(input: {
    session_id: string;
    role: MessageRecord["role"];
    content: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<MessageRecord> {
    const message: MessageRecord = {
      id: createId("msg"),
      session_id: input.session_id,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? null,
      created_at: nowIso()
    };
    const list = messages.get(input.session_id) ?? [];
    list.push(message);
    messages.set(input.session_id, list);
    return message;
  }

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    const timestamp = nowIso();
    const job: JobRecord = {
      id: createId("job"),
      session_id: input.session_id,
      step: input.step,
      status: "running",
      payload: input.payload ?? null,
      logs: [],
      error: null,
      created_at: timestamp,
      updated_at: timestamp
    };
    jobs.set(job.id, job);
    return job;
  }

  async updateJob(
    jobId: string,
    patch: Partial<Pick<JobRecord, "status" | "logs" | "error" | "payload">>
  ): Promise<JobRecord> {
    const current = jobs.get(jobId);
    if (!current) {
      throw new Error(`Job not found: ${jobId}`);
    }
    const next: JobRecord = {
      ...current,
      ...patch,
      updated_at: nowIso()
    };
    jobs.set(jobId, next);
    return next;
  }

  async listJobsBySession(sessionId: string): Promise<JobRecord[]> {
    return descByCreatedAt([...jobs.values()].filter((job) => job.session_id === sessionId));
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    return jobs.get(jobId) ?? null;
  }

  async countActiveJobsBySession(sessionId: string): Promise<number> {
    return [...jobs.values()].filter(
      (job) => job.session_id === sessionId && (job.status === "pending" || job.status === "running")
    ).length;
  }

  async createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
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
    const list = artifacts.get(input.session_id) ?? [];
    list.unshift(artifact);
    artifacts.set(input.session_id, list);
    return artifact;
  }

  async listArtifactsBySession(sessionId: string): Promise<ArtifactRecord[]> {
    return artifacts.get(sessionId) ?? [];
  }

  async createPack(input: CreatePackInput): Promise<PackRecord> {
    const pack: PackRecord = {
      id: createId("pack"),
      session_id: input.session_id,
      meta: input.meta,
      bundle_hash: input.bundle_hash,
      cid: input.cid ?? null,
      mint_tx: input.mint_tx ?? null,
      created_at: nowIso()
    };
    packs.set(pack.id, pack);
    return pack;
  }

  async updatePack(
    packId: string,
    patch: Partial<Pick<PackRecord, "meta" | "bundle_hash" | "cid" | "mint_tx">>
  ): Promise<PackRecord> {
    const current = packs.get(packId);
    if (!current) {
      throw new Error(`Pack not found: ${packId}`);
    }
    const next: PackRecord = {
      ...current,
      ...patch
    };
    packs.set(packId, next);
    return next;
  }

  async getPack(packId: string): Promise<PackRecord | null> {
    return packs.get(packId) ?? null;
  }

  async trackUsage(input: { session_id: string; type: string; amount: number }): Promise<void> {
    void input;
    return;
  }

  async createRuntimeGoal(input: {
    session_id: string;
    goal_type: RuntimeGoalRecord["goal_type"];
    goal_input?: Record<string, unknown> | null;
    idempotency_key?: string | null;
  }): Promise<RuntimeGoalRecord> {
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
    runtimeGoals.set(goal.id, goal);
    return goal;
  }

  async getRuntimeGoal(goalId: string): Promise<RuntimeGoalRecord | null> {
    return runtimeGoals.get(goalId) ?? null;
  }

  async findRuntimeGoalByIdempotency(idempotencyKey: string): Promise<RuntimeGoalRecord | null> {
    return [...runtimeGoals.values()].find((goal) => goal.idempotency_key === idempotencyKey) ?? null;
  }

  async findActiveRuntimeGoal(
    sessionId: string,
    goalType: RuntimeGoalRecord["goal_type"]
  ): Promise<RuntimeGoalRecord | null> {
    return (
      [...runtimeGoals.values()].find(
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
    const current = runtimeGoals.get(goalId);
    if (!current) {
      throw new Error(`Runtime goal not found: ${goalId}`);
    }
    const next: RuntimeGoalRecord = {
      ...current,
      ...patch,
      updated_at: nowIso()
    };
    runtimeGoals.set(goalId, next);
    return next;
  }

  async listRuntimeGoalsBySession(sessionId: string): Promise<RuntimeGoalRecord[]> {
    return descByCreatedAt([...runtimeGoals.values()].filter((goal) => goal.session_id === sessionId));
  }

  async createRuntimePlan(input: RuntimePlanInput): Promise<RuntimePlanRecord> {
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
    runtimePlans.set(plan.id, plan);
    return plan;
  }

  async listRuntimePlansByGoal(goalId: string): Promise<RuntimePlanRecord[]> {
    return descByCreatedAt([...runtimePlans.values()].filter((plan) => plan.goal_id === goalId));
  }

  async createRuntimeAction(input: RuntimeActionInput): Promise<RuntimeActionRecord> {
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
    runtimeActions.set(action.id, action);
    return action;
  }

  async getRuntimeActionByIdempotency(
    goalId: string,
    idempotencyKey: string
  ): Promise<RuntimeActionRecord | null> {
    return (
      [...runtimeActions.values()].find(
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
    const current = runtimeActions.get(actionId);
    if (!current) {
      throw new Error(`Runtime action not found: ${actionId}`);
    }
    const next: RuntimeActionRecord = {
      ...current,
      ...patch,
      updated_at: nowIso()
    };
    runtimeActions.set(actionId, next);
    return next;
  }

  async listRuntimeActionsByGoal(goalId: string): Promise<RuntimeActionRecord[]> {
    return descByCreatedAt([...runtimeActions.values()].filter((action) => action.goal_id === goalId));
  }

  async createRuntimeToolCall(input: RuntimeToolCallInput): Promise<RuntimeToolCallRecord> {
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
    runtimeToolCalls.set(call.id, call);
    return call;
  }

  async listRuntimeToolCallsByGoal(goalId: string): Promise<RuntimeToolCallRecord[]> {
    return descByCreatedAt([...runtimeToolCalls.values()].filter((call) => call.goal_id === goalId));
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
    runtimeEvals.set(evaluation.id, evaluation);
    return evaluation;
  }

  async listRuntimeEvalsByGoal(goalId: string): Promise<RuntimeEvalRecord[]> {
    return descByCreatedAt([...runtimeEvals.values()].filter((evaluation) => evaluation.goal_id === goalId));
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
    const existing = [...runtimeMemories.values()].find(
      (memory) =>
        memory.scope === input.scope &&
        memory.session_id === input.session_id &&
        memory.brand_key === input.brand_key &&
        memory.memory_key === input.memory_key
    );
    if (existing) {
      const next: RuntimeMemoryRecord = {
        ...existing,
        memory_value: input.memory_value,
        weight: input.weight,
        source_action_id: input.source_action_id,
        updated_at: nowIso()
      };
      runtimeMemories.set(existing.id, next);
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
    runtimeMemories.set(memory.id, memory);
    return memory;
  }

  async listRuntimeMemories(input: {
    scope?: RuntimeMemoryRecord["scope"];
    session_id?: string;
    brand_key?: string;
  }): Promise<RuntimeMemoryRecord[]> {
    const filtered = [...runtimeMemories.values()].filter((memory) => {
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
    const event: RuntimeEventRecord = {
      id: createId("rt_evt"),
      session_id: input.session_id,
      goal_id: input.goal_id,
      event_type: input.event_type,
      payload: input.payload,
      created_at: nowIso()
    };
    runtimeEvents.set(event.id, event);
    return event;
  }

  async listRuntimeEventsByGoal(goalId: string): Promise<RuntimeEventRecord[]> {
    return descByCreatedAt([...runtimeEvents.values()].filter((event) => event.goal_id === goalId));
  }
}
