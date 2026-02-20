import type {
  ArtifactRecord,
  JobRecord,
  MessageRecord,
  PackRecord,
  SessionRecord
} from "../agent/types";
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

function nowIso(): string {
  return new Date().toISOString();
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
    return [...jobs.values()]
      .filter((job) => job.session_id === sessionId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
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
}
