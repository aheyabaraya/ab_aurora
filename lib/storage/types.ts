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

export interface CreateSessionInput {
  mode: SessionMode;
  product: string;
  audience: string;
  style_keywords: string[];
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
}

export function isActiveJobStatus(status: JobStatus): boolean {
  return status === "pending" || status === "running";
}

export function isRunningStatus(status: AgentStatus): boolean {
  return status === "running" || status === "idle";
}
