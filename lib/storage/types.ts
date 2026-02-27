import type {
  AgentStep,
  AgentStatus,
  ArtifactKind,
  ArtifactRecord,
  JobRecord,
  JobStatus,
  MessageRecord,
  PackRecord,
  SessionMode,
  SessionRecord
} from "../agent/types";
import type {
  RuntimeActionInput,
  RuntimeActionRecord,
  RuntimeEvalRecord,
  RuntimeEventRecord,
  RuntimeGoalRecord,
  RuntimeGoalType,
  RuntimeMemoryRecord,
  RuntimePlanInput,
  RuntimePlanRecord,
  RuntimeToolCallInput,
  RuntimeToolCallRecord
} from "../runtime/types";

export interface CreateSessionInput {
  owner_user_id?: string | null;
  mode: SessionMode;
  product: string;
  audience: string;
  style_keywords: string[];
  design_direction_note?: string;
  q0_intent_confidence?: number;
  auto_continue: boolean;
  auto_pick_top1: boolean;
}

export interface CreateJobInput {
  session_id: string;
  step: AgentStep;
  payload?: Record<string, unknown>;
}

export interface CreateArtifactInput {
  session_id: string;
  job_id?: string | null;
  step: AgentStep;
  kind: ArtifactKind;
  title: string;
  content: Record<string, unknown>;
}

export interface CreatePackInput {
  session_id: string;
  meta: Record<string, unknown>;
  bundle_hash: string;
  cid?: string | null;
  mint_tx?: string | null;
}

export interface StorageRepository {
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  updateSession(
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
  ): Promise<SessionRecord>;
  appendMessage(input: {
    session_id: string;
    role: MessageRecord["role"];
    content: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<MessageRecord>;
  listMessagesBySession(sessionId: string, limit?: number): Promise<MessageRecord[]>;
  createJob(input: CreateJobInput): Promise<JobRecord>;
  updateJob(jobId: string, patch: Partial<Pick<JobRecord, "status" | "logs" | "error" | "payload">>): Promise<JobRecord>;
  listJobsBySession(sessionId: string): Promise<JobRecord[]>;
  getJob(jobId: string): Promise<JobRecord | null>;
  countActiveJobsBySession(sessionId: string): Promise<number>;
  createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord>;
  listArtifactsBySession(sessionId: string): Promise<ArtifactRecord[]>;
  createPack(input: CreatePackInput): Promise<PackRecord>;
  updatePack(packId: string, patch: Partial<Pick<PackRecord, "meta" | "bundle_hash" | "cid" | "mint_tx">>): Promise<PackRecord>;
  getPack(packId: string): Promise<PackRecord | null>;
  trackUsage(input: { session_id: string; type: string; amount: number }): Promise<void>;
  createRuntimeGoal(input: {
    session_id: string;
    goal_type: RuntimeGoalType;
    goal_input?: Record<string, unknown> | null;
    idempotency_key?: string | null;
  }): Promise<RuntimeGoalRecord>;
  getRuntimeGoal(goalId: string): Promise<RuntimeGoalRecord | null>;
  findRuntimeGoalByIdempotency(idempotencyKey: string): Promise<RuntimeGoalRecord | null>;
  findActiveRuntimeGoal(sessionId: string, goalType: RuntimeGoalType): Promise<RuntimeGoalRecord | null>;
  updateRuntimeGoal(
    goalId: string,
    patch: Partial<
      Pick<
        RuntimeGoalRecord,
        "status" | "current_plan_id" | "current_step_no" | "last_action_id" | "last_eval_id" | "error"
      >
    >
  ): Promise<RuntimeGoalRecord>;
  listRuntimeGoalsBySession(sessionId: string): Promise<RuntimeGoalRecord[]>;
  createRuntimePlan(input: RuntimePlanInput): Promise<RuntimePlanRecord>;
  listRuntimePlansByGoal(goalId: string): Promise<RuntimePlanRecord[]>;
  createRuntimeAction(input: RuntimeActionInput): Promise<RuntimeActionRecord>;
  getRuntimeActionByIdempotency(
    goalId: string,
    idempotencyKey: string
  ): Promise<RuntimeActionRecord | null>;
  updateRuntimeAction(
    actionId: string,
    patch: Partial<
      Pick<
        RuntimeActionRecord,
        "status" | "policy_result" | "error" | "output" | "finished_at"
      >
    >
  ): Promise<RuntimeActionRecord>;
  listRuntimeActionsByGoal(goalId: string): Promise<RuntimeActionRecord[]>;
  createRuntimeToolCall(input: RuntimeToolCallInput): Promise<RuntimeToolCallRecord>;
  listRuntimeToolCallsByGoal(goalId: string): Promise<RuntimeToolCallRecord[]>;
  createRuntimeEval(input: {
    goal_id: string;
    plan_id: string | null;
    action_id: string | null;
    scores: Record<string, number>;
    pass: boolean;
    reasons: string[];
    next_hint: string | null;
  }): Promise<RuntimeEvalRecord>;
  listRuntimeEvalsByGoal(goalId: string): Promise<RuntimeEvalRecord[]>;
  upsertRuntimeMemory(input: {
    scope: RuntimeMemoryRecord["scope"];
    session_id: string | null;
    brand_key: string | null;
    memory_key: string;
    memory_value: Record<string, unknown>;
    weight: number;
    source_action_id: string | null;
  }): Promise<RuntimeMemoryRecord>;
  listRuntimeMemories(input: {
    scope?: RuntimeMemoryRecord["scope"];
    session_id?: string;
    brand_key?: string;
  }): Promise<RuntimeMemoryRecord[]>;
  createRuntimeEvent(input: {
    session_id: string;
    goal_id: string;
    event_type: RuntimeEventRecord["event_type"];
    payload: Record<string, unknown>;
  }): Promise<RuntimeEventRecord>;
  listRuntimeEventsByGoal(goalId: string): Promise<RuntimeEventRecord[]>;
}

export function isActiveJobStatus(status: JobStatus): boolean {
  return status === "pending" || status === "running";
}

export function isRunningStatus(status: AgentStatus): boolean {
  return status === "running" || status === "idle";
}
