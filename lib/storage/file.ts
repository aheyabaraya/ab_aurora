import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
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

type DbShape = {
  sessions: SessionRecord[];
  messages: MessageRecord[];
  jobs: JobRecord[];
  artifacts: ArtifactRecord[];
  packs: PackRecord[];
};

function nowIso(): string {
  return new Date().toISOString();
}

const runtimeDir = join(process.cwd(), ".data", "runtime");
const runtimeFile = join(runtimeDir, "db.json");

function ensureRuntimeFile() {
  mkdirSync(runtimeDir, { recursive: true });
  try {
    readFileSync(runtimeFile, "utf8");
  } catch {
    const initial: DbShape = {
      sessions: [],
      messages: [],
      jobs: [],
      artifacts: [],
      packs: []
    };
    writeFileSync(runtimeFile, JSON.stringify(initial), "utf8");
  }
}

function loadDb(): DbShape {
  ensureRuntimeFile();
  const text = readFileSync(runtimeFile, "utf8");
  return JSON.parse(text) as DbShape;
}

function saveDb(db: DbShape): void {
  ensureRuntimeFile();
  writeFileSync(runtimeFile, JSON.stringify(db), "utf8");
}

export class FileStorageRepository implements StorageRepository {
  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const db = loadDb();
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
    return db.jobs
      .filter((job) => job.session_id === sessionId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
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
    return db.artifacts
      .filter((artifact) => artifact.session_id === sessionId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
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
    void input;
    return;
  }
}
