import { randomUUID } from "crypto";
import { runAgentPipeline } from "../agent/orchestrator";
import type { AgentStatus, AgentStep, ArtifactKind, SessionMode } from "../agent/types";
import type { SeedSessionPreset } from "../agent/schemas";
import { startRuntimeGoal } from "../runtime/runner";
import type { StorageRepository } from "../storage/types";

const DEFAULT_PRODUCT = "Aurora Session Seed Harness for Deterministic API Contract Validation";
const DEFAULT_AUDIENCE = "API engineers and QA operators";
const DEFAULT_STYLE_KEYWORDS = ["editorial", "calm", "ritual"];

const PRESET_EXPECTATION: Record<SeedSessionPreset, { current_step: AgentStep; status: AgentStatus }> = {
  fresh: {
    current_step: "interview_collect",
    status: "idle"
  },
  top3_ready: {
    current_step: "top3_select",
    status: "running"
  },
  selected_ready: {
    current_step: "approve_build",
    status: "running"
  },
  build_confirm_required: {
    current_step: "approve_build",
    status: "wait_user"
  },
  package_ready: {
    current_step: "package",
    status: "running"
  },
  done: {
    current_step: "done",
    status: "completed"
  }
};

const REQUIRED_ARTIFACTS: Record<SeedSessionPreset, ArtifactKind[]> = {
  fresh: [],
  top3_ready: ["interview", "brand_spec_draft", "candidates_top3"],
  selected_ready: ["selection"],
  build_confirm_required: ["selection"],
  package_ready: ["tokens", "social_assets", "code_plan", "validation"],
  done: ["pack_meta"]
};

function uniqueKinds(items: ArtifactKind[]): ArtifactKind[] {
  return [...new Set(items)];
}

async function runSingleStep(input: {
  storage: StorageRepository;
  session_id: string;
  step?: AgentStep;
  action?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await runAgentPipeline({
    storage: input.storage,
    request: {
      session_id: input.session_id,
      step: input.step,
      action: input.action,
      payload: input.payload,
      idempotency_key: `seed-${randomUUID()}`
    }
  });
}

async function runFixedSteps(storage: StorageRepository, sessionId: string, steps: number): Promise<void> {
  for (let index = 0; index < steps; index += 1) {
    await runSingleStep({
      storage,
      session_id: sessionId
    });
  }
}

async function progressToApproveBuild(storage: StorageRepository, sessionId: string): Promise<void> {
  await runFixedSteps(storage, sessionId, 4);
  const afterTop3 = await storage.getSession(sessionId);
  if (!afterTop3) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (afterTop3.current_step !== "top3_select") {
    throw new Error(`Failed to reach top3_select from seed progression: ${afterTop3.current_step}`);
  }

  if (afterTop3.selected_candidate_id) {
    await runSingleStep({
      storage,
      session_id: sessionId
    });
    return;
  }

  await runSingleStep({
    storage,
    session_id: sessionId,
    action: "select_candidate",
    payload: {
      candidate_id: "cand_1"
    }
  });
}

async function runApproveBuild(storage: StorageRepository, sessionId: string): Promise<void> {
  const session = await storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  if (session.current_step !== "approve_build") {
    throw new Error(`Expected approve_build before running build output, got ${session.current_step}`);
  }

  await runSingleStep({
    storage,
    session_id: sessionId,
    action: session.auto_pick_top1 ? undefined : "proceed"
  });
}

function assertPresetState(input: {
  preset: SeedSessionPreset;
  current_step: AgentStep;
  status: AgentStatus;
  artifact_kinds: ArtifactKind[];
}): void {
  const expected = PRESET_EXPECTATION[input.preset];
  if (input.current_step !== expected.current_step || input.status !== expected.status) {
    throw new Error(
      `Seed preset mismatch: expected ${expected.current_step}/${expected.status}, got ${input.current_step}/${input.status}`
    );
  }

  const requiredKinds = REQUIRED_ARTIFACTS[input.preset];
  for (const kind of requiredKinds) {
    if (!input.artifact_kinds.includes(kind)) {
      throw new Error(`Seed preset ${input.preset} missing artifact kind: ${kind}`);
    }
  }
}

export interface BuildSessionSeedInput {
  storage: StorageRepository;
  preset: SeedSessionPreset;
  mode?: SessionMode;
  product?: string;
  audience?: string;
  style_keywords?: string[];
  auto_continue?: boolean;
  auto_pick_top1?: boolean;
  with_runtime_goal?: boolean;
}

export interface BuildSessionSeedResult {
  seed_id: string;
  preset: SeedSessionPreset;
  session_id: string;
  current_step: AgentStep;
  status: AgentStatus;
  selected_candidate_id: string | null;
  artifact_kinds: ArtifactKind[];
  runtime_goal_id?: string;
}

export async function buildSessionSeed(input: BuildSessionSeedInput): Promise<BuildSessionSeedResult> {
  const seedId = `seed_${randomUUID()}`;
  const effectiveAutoPickTop1 =
    input.preset === "build_confirm_required" ? false : input.auto_pick_top1 ?? true;

  const session = await input.storage.createSession({
    mode: input.mode ?? "mode_b",
    product: input.product ?? DEFAULT_PRODUCT,
    audience: input.audience ?? DEFAULT_AUDIENCE,
    style_keywords: input.style_keywords ?? DEFAULT_STYLE_KEYWORDS,
    auto_continue: input.auto_continue ?? false,
    auto_pick_top1: effectiveAutoPickTop1
  });

  await input.storage.appendMessage({
    session_id: session.id,
    role: "system",
    content: `Seed preset initialized: ${input.preset}`,
    metadata: {
      seed_id: seedId,
      preset: input.preset
    }
  });

  if (input.preset === "top3_ready") {
    await runFixedSteps(input.storage, session.id, 4);
  } else if (input.preset === "selected_ready") {
    await progressToApproveBuild(input.storage, session.id);
  } else if (input.preset === "build_confirm_required") {
    await progressToApproveBuild(input.storage, session.id);
    await runSingleStep({
      storage: input.storage,
      session_id: session.id
    });
  } else if (input.preset === "package_ready") {
    await progressToApproveBuild(input.storage, session.id);
    await runApproveBuild(input.storage, session.id);
  } else if (input.preset === "done") {
    await progressToApproveBuild(input.storage, session.id);
    await runApproveBuild(input.storage, session.id);
    await runSingleStep({
      storage: input.storage,
      session_id: session.id
    });
  }

  let runtimeGoalId: string | undefined = undefined;
  if (input.with_runtime_goal) {
    const started = await startRuntimeGoal({
      storage: input.storage,
      session_id: session.id,
      goal_type: "deliver_demo_pack",
      idempotency_key: `seed-runtime-${randomUUID()}`
    });
    runtimeGoalId = started.goal.id;
  }

  const seededSession = await input.storage.getSession(session.id);
  if (!seededSession) {
    throw new Error(`Session not found: ${session.id}`);
  }

  const artifacts = await input.storage.listArtifactsBySession(session.id);
  const artifactKinds = uniqueKinds(artifacts.map((artifact) => artifact.kind));
  assertPresetState({
    preset: input.preset,
    current_step: seededSession.current_step,
    status: seededSession.status,
    artifact_kinds: artifactKinds
  });

  return {
    seed_id: seedId,
    preset: input.preset,
    session_id: seededSession.id,
    current_step: seededSession.current_step,
    status: seededSession.status,
    selected_candidate_id: seededSession.selected_candidate_id,
    artifact_kinds: artifactKinds,
    runtime_goal_id: runtimeGoalId
  };
}
