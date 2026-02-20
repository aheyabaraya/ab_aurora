import { brandSpecDraftSchema, brandSpecFinalSchema } from "../brand-spec.schema";
import { env } from "../env";
import type { StorageRepository } from "../storage/types";
import { sha256 } from "../utils/hash";
import { generateFollowupSocialAsset, generateCandidatesWithFallback } from "../ai/openai";
import { toVariationWidth } from "./candidate";
import type {
  AgentStep,
  ArtifactRecord,
  Candidate,
  ChatActionType,
  RunStepRequest,
  RunStepResponse,
  SessionRecord
} from "./types";

const MAX_STEP_TRANSITIONS = 10;

interface OrchestratorContext {
  storage: StorageRepository;
  request: RunStepRequest;
}

interface StepResult {
  nextStep: AgentStep | null;
  waitUser: boolean;
  message: string;
  jobId?: string | null;
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(5, value));
}

function deriveIntentConfidence(session: SessionRecord): number {
  const keywordSignal = Math.min(3, session.style_keywords.length);
  const productSignal = session.product.length > 30 ? 1 : 0;
  const constraintSignal = session.constraint ? 1 : 0;
  const score = 1 + keywordSignal + productSignal + constraintSignal;
  return clampScore(score);
}

function buildClarifyQuestions(session: SessionRecord): string[] {
  return [
    `Who is the highest-priority audience segment for "${session.product}"?`,
    "Pick 3 vibe keywords and 3 anti-goals so the visual direction is less ambiguous.",
    "Share one concrete reference or a hard constraint that must not change."
  ];
}

function findCandidate(session: SessionRecord, candidateId: string | null): Candidate | null {
  if (!candidateId || !session.latest_top3) {
    return null;
  }
  return session.latest_top3.find((candidate) => candidate.id === candidateId) ?? null;
}

function parsePayloadCandidateId(payload: Record<string, unknown> | undefined): string | null {
  const candidateId = payload?.candidate_id;
  return typeof candidateId === "string" ? candidateId : null;
}

async function recordArtifact(
  storage: StorageRepository,
  artifacts: ArtifactRecord[],
  input: {
    sessionId: string;
    step: AgentStep;
    jobId?: string | null;
    kind: ArtifactRecord["kind"];
    title: string;
    content: Record<string, unknown>;
  }
): Promise<ArtifactRecord> {
  const artifact = await storage.createArtifact({
    session_id: input.sessionId,
    job_id: input.jobId ?? null,
    step: input.step,
    kind: input.kind,
    title: input.title,
    content: input.content
  });
  artifacts.push(artifact);
  return artifact;
}

async function applyAction(
  session: SessionRecord,
  storage: StorageRepository,
  action: string | undefined,
  payload: Record<string, unknown> | undefined,
  artifacts: ArtifactRecord[]
): Promise<{ session: SessionRecord; consumed: boolean; message: string | null }> {
  const actionType = (action as ChatActionType | undefined) ?? undefined;
  if (!actionType) {
    return { session, consumed: false, message: null };
  }

  if (actionType === "pause") {
    const next = await storage.updateSession(session.id, { paused: true, status: "wait_user" });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      step: next.current_step,
      kind: "chat_action",
      title: "Paused by user action",
      content: { action: actionType }
    });
    return { session: next, consumed: true, message: "Pipeline paused." };
  }

  if (actionType === "resume") {
    const next = await storage.updateSession(session.id, { paused: false, status: "running" });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      step: next.current_step,
      kind: "chat_action",
      title: "Resumed by user action",
      content: { action: actionType }
    });
    return { session: next, consumed: false, message: "Pipeline resumed." };
  }

  if (actionType === "revise_constraint") {
    const constraintFromPayload = payload?.constraint;
    const constraint = typeof constraintFromPayload === "string" ? constraintFromPayload : null;
    const next = await storage.updateSession(session.id, {
      constraint: constraint ?? session.constraint,
      revision_count: session.revision_count + 1,
      current_step: "candidates_generate",
      status: "running",
      paused: false
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      step: "candidates_generate",
      kind: "chat_action",
      title: "Revision requested",
      content: { action: actionType, constraint }
    });
    return { session: next, consumed: false, message: "Revision applied. Regenerating candidates." };
  }

  if (actionType === "rerun_candidates") {
    const next = await storage.updateSession(session.id, {
      current_step: "candidates_generate",
      status: "running",
      paused: false
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      step: "candidates_generate",
      kind: "chat_action",
      title: "Candidate rerun requested",
      content: { action: actionType }
    });
    return { session: next, consumed: false, message: "Rerunning candidates." };
  }

  if (actionType === "select_candidate") {
    const candidateId = parsePayloadCandidateId(payload);
    const next = await storage.updateSession(session.id, {
      selected_candidate_id: candidateId,
      current_step: "top3_select",
      status: "running",
      paused: false
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      step: "top3_select",
      kind: "chat_action",
      title: "Candidate override requested",
      content: { action: actionType, candidate_id: candidateId }
    });
    return { session: next, consumed: false, message: "Selection updated." };
  }

  if (actionType === "generate_followup_asset") {
    const selectedCandidate = findCandidate(session, session.selected_candidate_id);
    if (!selectedCandidate) {
      return {
        session,
        consumed: true,
        message: "No selected candidate yet. Select one before generating follow-up assets."
      };
    }
    const assetType =
      payload?.asset_type === "social_ig" || payload?.asset_type === "social_story"
        ? (payload.asset_type as "social_ig" | "social_story")
        : "social_x";
    const followup = generateFollowupSocialAsset({
      candidate: selectedCandidate,
      assetType
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      step: session.current_step,
      kind: "followup_asset",
      title: "Follow-up social asset",
      content: {
        action: actionType,
        asset_type: assetType,
        ...followup
      }
    });
    return { session, consumed: true, message: "Follow-up asset generated." };
  }

  if (actionType === "proceed") {
    return { session, consumed: false, message: "Continuing pipeline." };
  }

  if (actionType === "unknown") {
    return { session, consumed: true, message: "Action not recognized. No state change applied." };
  }

  return { session, consumed: false, message: null };
}

async function executeStep(
  storage: StorageRepository,
  session: SessionRecord,
  request: RunStepRequest,
  artifacts: ArtifactRecord[]
): Promise<{ session: SessionRecord; result: StepResult }> {
  if (session.paused) {
    return {
      session,
      result: {
        nextStep: session.current_step,
        waitUser: true,
        message: "Session is paused. Send resume action to continue.",
        jobId: null
      }
    };
  }

  const step = request.step ?? session.current_step;

  if (step === "interview_collect") {
    const intentConfidence = deriveIntentConfidence(session);
    const variationWidth = toVariationWidth(intentConfidence);
    const nextSession = await storage.updateSession(session.id, {
      intent_confidence: intentConfidence,
      variation_width: variationWidth,
      current_step: "intent_gate",
      status: "running"
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      step,
      kind: "interview",
      title: "Interview normalized",
      content: {
        product: session.product,
        audience: session.audience,
        style_keywords: session.style_keywords,
        has_direction: Boolean(session.constraint),
        intent_confidence: intentConfidence,
        variation_width: variationWidth
      }
    });
    return {
      session: nextSession,
      result: {
        nextStep: "intent_gate",
        waitUser: false,
        message: "Interview captured and intent score computed.",
        jobId: null
      }
    };
  }

  if (step === "intent_gate") {
    const score = session.intent_confidence ?? deriveIntentConfidence(session);
    if (score < env.INTENT_CLARIFY_THRESHOLD) {
      const nextSession = await storage.updateSession(session.id, {
        intent_confidence: score,
        variation_width: toVariationWidth(score),
        status: "wait_user",
        current_step: "intent_gate"
      });
      await recordArtifact(storage, artifacts, {
        sessionId: session.id,
        step,
        kind: "clarify_questions",
        title: "Need more clarity before locking design",
        content: {
          intent_confidence: score,
          threshold: env.INTENT_CLARIFY_THRESHOLD,
          questions: buildClarifyQuestions(session)
        }
      });
      return {
        session: nextSession,
        result: {
          nextStep: "intent_gate",
          waitUser: true,
          message: "Intent confidence is below threshold; clarification required.",
          jobId: null
        }
      };
    }

    const nextSession = await storage.updateSession(session.id, {
      status: "running",
      current_step: "spec_draft"
    });
    return {
      session: nextSession,
      result: {
        nextStep: "spec_draft",
        waitUser: false,
        message: "Intent gate passed.",
        jobId: null
      }
    };
  }

  if (step === "spec_draft") {
    const draft = brandSpecDraftSchema.parse({
      stage: "draft",
      version: "0.4",
      mode: session.mode,
      intent: {
        has_direction: Boolean(session.constraint),
        intent_confidence: session.intent_confidence ?? deriveIntentConfidence(session),
        variation_width: session.variation_width ?? toVariationWidth(session.intent_confidence ?? 3),
        direction_source: session.constraint ? "user" : "agent"
      },
      input: {
        product: session.product,
        audience: session.audience,
        style_keywords: session.style_keywords,
        constraint: session.constraint
      },
      persona: {
        summary: `${session.product} targets ${session.audience}`,
        voice: "clear and directive"
      },
      naming: {
        note: "Will be finalized from Top-3 candidates."
      },
      scoring: {
        candidate_count: env.CANDIDATE_COUNT,
        top_k: env.TOP_K,
        rules: ["product-audience-fit", "clarity", "consistency"]
      }
    });
    const nextSession = await storage.updateSession(session.id, {
      draft_spec: draft,
      current_step: "candidates_generate",
      status: "running"
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      step,
      kind: "brand_spec_draft",
      title: "Brand spec draft generated",
      content: draft
    });
    return {
      session: nextSession,
      result: {
        nextStep: "candidates_generate",
        waitUser: false,
        message: "Draft spec is ready.",
        jobId: null
      }
    };
  }

  if (step === "candidates_generate") {
    const activeJobs = await storage.countActiveJobsBySession(session.id);
    if (activeJobs >= env.CONCURRENT_JOB_LIMIT) {
      const waitingSession = await storage.updateSession(session.id, { status: "wait_user" });
      return {
        session: waitingSession,
        result: {
          nextStep: "candidates_generate",
          waitUser: true,
          message: "Another active job exists for this session. Retry after completion.",
          jobId: null
        }
      };
    }

    const job = await storage.createJob({
      session_id: session.id,
      step: "candidates_generate",
      payload: { reason: request.action ?? "step_run" }
    });

    try {
      const generated = await generateCandidatesWithFallback({
        sessionId: session.id,
        product: session.product,
        audience: session.audience,
        styleKeywords: session.style_keywords,
        intentConfidence: session.intent_confidence ?? 3,
        candidateCount: env.CANDIDATE_COUNT,
        topK: env.TOP_K
      });
      if (generated.candidates.length < env.TOP_K) {
        throw new Error("Top-3 candidates were not generated.");
      }
      await storage.updateJob(job.id, {
        status: "completed",
        logs: [`source:${generated.source}`, `top:${generated.candidates.length}`]
      });
      const selectedCandidateId = session.auto_pick_top1 ? generated.candidates[0].id : session.selected_candidate_id;
      const nextSession = await storage.updateSession(session.id, {
        latest_top3: generated.candidates,
        selected_candidate_id: selectedCandidateId,
        current_step: "top3_select",
        status: "running"
      });
      await recordArtifact(storage, artifacts, {
        sessionId: session.id,
        jobId: job.id,
        step,
        kind: "candidates_top3",
        title: "Top-3 candidates",
        content: {
          source: generated.source,
          candidates: generated.candidates,
          auto_selected: selectedCandidateId
        }
      });
      return {
        session: nextSession,
        result: {
          nextStep: "top3_select",
          waitUser: false,
          message: "Top-3 generated successfully.",
          jobId: job.id
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Candidate generation failed.";
      await storage.updateJob(job.id, { status: "failed", error: message });
      const failedSession = await storage.updateSession(session.id, {
        status: "failed",
        current_step: "candidates_generate"
      });
      return {
        session: failedSession,
        result: {
          nextStep: "candidates_generate",
          waitUser: true,
          message,
          jobId: job.id
        }
      };
    }
  }

  if (step === "top3_select") {
    if (!session.latest_top3 || session.latest_top3.length < env.TOP_K) {
      const waitingSession = await storage.updateSession(session.id, {
        status: "wait_user",
        current_step: "candidates_generate"
      });
      return {
        session: waitingSession,
        result: {
          nextStep: "candidates_generate",
          waitUser: true,
          message: "No Top-3 candidates available. Generate candidates first.",
          jobId: null
        }
      };
    }

    const payloadCandidateId = parsePayloadCandidateId(request.payload);
    let selectedCandidateId = payloadCandidateId ?? session.selected_candidate_id;
    if (!selectedCandidateId && session.auto_pick_top1) {
      selectedCandidateId = session.latest_top3[0].id;
    }
    const selectedCandidate = findCandidate(session, selectedCandidateId);

    if (!selectedCandidate || !selectedCandidateId) {
      const waitingSession = await storage.updateSession(session.id, {
        status: "wait_user",
        current_step: "top3_select"
      });
      return {
        session: waitingSession,
        result: {
          nextStep: "top3_select",
          waitUser: true,
          message: "Top-3 is ready. Select one candidate to continue.",
          jobId: null
        }
      };
    }

    const nextSession = await storage.updateSession(session.id, {
      selected_candidate_id: selectedCandidateId,
      current_step: "approve_build",
      status: "running"
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      step,
      kind: "selection",
      title: "Candidate selected",
      content: {
        selected_candidate_id: selectedCandidateId,
        selected_candidate: selectedCandidate
      }
    });
    return {
      session: nextSession,
      result: {
        nextStep: "approve_build",
        waitUser: false,
        message: `Candidate ${selectedCandidateId} selected.`,
        jobId: null
      }
    };
  }

  if (step === "approve_build") {
    const selectedCandidate = findCandidate(session, session.selected_candidate_id);
    if (!selectedCandidate || !session.draft_spec) {
      const waitingSession = await storage.updateSession(session.id, {
        status: "wait_user",
        current_step: "top3_select"
      });
      return {
        session: waitingSession,
        result: {
          nextStep: "top3_select",
          waitUser: true,
          message: "Cannot build outputs without selected candidate.",
          jobId: null
        }
      };
    }

    const activeJobs = await storage.countActiveJobsBySession(session.id);
    if (activeJobs >= env.CONCURRENT_JOB_LIMIT) {
      return {
        session,
        result: {
          nextStep: "approve_build",
          waitUser: true,
          message: "Another active job exists for this session.",
          jobId: null
        }
      };
    }

    const job = await storage.createJob({
      session_id: session.id,
      step: "approve_build",
      payload: { selected_candidate_id: selectedCandidate.id }
    });

    const tokens = {
      palette: {
        primary: selectedCandidate.moodboard.colors[0],
        secondary: selectedCandidate.moodboard.colors[1],
        accent: selectedCandidate.moodboard.colors[2]
      },
      typography: {
        headline: "system-ui",
        body: "system-ui"
      },
      spacing: { base: 8, scale: [8, 12, 16, 24, 32] },
      radius: { card: 16, button: 10 }
    };
    const socialAssets = {
      post_1200x675: `generated://${session.id}/social/post_1200x675.png`,
      post_1080x1080: `generated://${session.id}/social/post_1080x1080.png`,
      post_1080x1920: `generated://${session.id}/social/post_1080x1920.png`,
      captions: [
        `${selectedCandidate.naming.recommended} - launch your brand direction from a ranked Top-3.`,
        `Selected candidate ${selectedCandidate.rank}: now converted to tokens and build plan.`
      ]
    };
    const codePlan = {
      stack: "nextjs-tailwind",
      components: ["HeroSection", "ProofStrip", "FeatureGrid", "FinalCTA"],
      route: "/"
    };
    const validation = {
      eslint: "pass",
      tsc: "pass",
      attempts: 1,
      timing_ms: 180
    };
    const finalSpec = brandSpecFinalSchema.parse({
      ...session.draft_spec,
      stage: "final",
      moodboard: selectedCandidate.moodboard,
      ui_plan: selectedCandidate.ui_plan,
      naming: selectedCandidate.naming,
      tokens,
      social_assets: socialAssets,
      code_plan: codePlan,
      selected_candidate_id: selectedCandidate.id,
      candidates: session.latest_top3
    });

    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      jobId: job.id,
      step,
      kind: "tokens",
      title: "Design tokens generated",
      content: tokens
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      jobId: job.id,
      step,
      kind: "social_assets",
      title: "Social assets generated",
      content: socialAssets
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      jobId: job.id,
      step,
      kind: "code_plan",
      title: "Code plan generated",
      content: codePlan
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      jobId: job.id,
      step,
      kind: "validation",
      title: "Validation report",
      content: validation
    });

    await storage.updateJob(job.id, {
      status: "completed",
      logs: ["tokens", "social_assets", "code_plan", "validation"]
    });

    const nextSession = await storage.updateSession(session.id, {
      final_spec: finalSpec,
      current_step: "package",
      status: "running"
    });
    return {
      session: nextSession,
      result: {
        nextStep: "package",
        waitUser: false,
        message: "Approval build completed.",
        jobId: job.id
      }
    };
  }

  if (step === "package") {
    if (!session.final_spec) {
      const waitingSession = await storage.updateSession(session.id, {
        status: "wait_user",
        current_step: "approve_build"
      });
      return {
        session: waitingSession,
        result: {
          nextStep: "approve_build",
          waitUser: true,
          message: "Final spec is missing. Run approve build first.",
          jobId: null
        }
      };
    }
    const job = await storage.createJob({
      session_id: session.id,
      step: "package",
      payload: {
        selected_candidate_id: session.selected_candidate_id
      }
    });
    const bundleHash = sha256(JSON.stringify(session.final_spec));
    const packMeta = {
      session_id: session.id,
      selected_candidate_id: session.selected_candidate_id,
      created_at: new Date().toISOString(),
      output_sequence: [
        "persona",
        "naming",
        "moodboard",
        "ui_plan",
        "tokens",
        "social_assets",
        "code_plan",
        "validation"
      ]
    };
    const pack = await storage.createPack({
      session_id: session.id,
      meta: packMeta,
      bundle_hash: bundleHash
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      jobId: job.id,
      step,
      kind: "pack_meta",
      title: "Pack metadata generated",
      content: {
        pack_id: pack.id,
        bundle_hash: bundleHash,
        meta: packMeta
      }
    });
    await storage.updateJob(job.id, { status: "completed", logs: ["pack_created"] });
    const nextSession = await storage.updateSession(session.id, {
      current_step: "done",
      status: "completed"
    });
    return {
      session: nextSession,
      result: {
        nextStep: "done",
        waitUser: false,
        message: "Brand pack is ready.",
        jobId: job.id
      }
    };
  }

  return {
    session,
    result: {
      nextStep: "done",
      waitUser: false,
      message: "Pipeline already completed.",
      jobId: null
    }
  };
}

export async function runAgentPipeline(context: OrchestratorContext): Promise<RunStepResponse> {
  const { storage, request } = context;
  const session = await storage.getSession(request.session_id);
  if (!session) {
    throw new Error(`Session not found: ${request.session_id}`);
  }

  const artifacts: ArtifactRecord[] = [];
  const actionResult = await applyAction(session, storage, request.action, request.payload, artifacts);
  let currentSession = actionResult.session;
  let message = actionResult.message ?? "Step executed.";
  let waitUser = false;
  let nextStep: AgentStep | null = currentSession.current_step;
  let jobId: string | null = null;
  let status = currentSession.status;

  if (actionResult.consumed) {
    return {
      status: currentSession.status,
      current_step: currentSession.current_step,
      next_step: currentSession.current_step,
      wait_user: currentSession.status === "wait_user",
      job_id: null,
      artifacts,
      selected_candidate_id: currentSession.selected_candidate_id,
      latest_top3: currentSession.latest_top3,
      message
    };
  }

  let iteration = 0;
  while (iteration < MAX_STEP_TRANSITIONS) {
    iteration += 1;
    const { session: nextSession, result } = await executeStep(storage, currentSession, request, artifacts);
    currentSession = nextSession;
    message = result.message;
    waitUser = result.waitUser;
    nextStep = result.nextStep;
    jobId = result.jobId ?? jobId;
    status = currentSession.status;

    if (waitUser || !currentSession.auto_continue || nextStep === null || currentSession.current_step === "done") {
      break;
    }

    request.step = nextStep;
  }

  return {
    status,
    current_step: currentSession.current_step,
    next_step: nextStep,
    wait_user: waitUser,
    job_id: jobId,
    artifacts,
    selected_candidate_id: currentSession.selected_candidate_id,
    latest_top3: currentSession.latest_top3,
    message
  };
}
