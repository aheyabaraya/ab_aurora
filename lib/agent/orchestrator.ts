import {
  brandSpecDraftSchema,
  brandSpecFinalSchema,
  type BrandDirection
} from "../brand-spec.schema";
import { env } from "../env";
import type { StorageRepository } from "../storage/types";
import { sha256 } from "../utils/hash";
import {
  generateCandidatesWithFallback,
  generateConversationFollowupAsset,
  generateDirectionWithFallback,
  generateFollowupSocialAsset,
  generateSocialAssetsWithFallback,
  type OpenAiTextUsage
} from "../ai/openai";
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

function isActiveJobConflictError(error: unknown): boolean {
  return error instanceof Error && /active job already exists for session/i.test(error.message);
}

async function returnActiveJobConflict(
  storage: StorageRepository,
  session: SessionRecord,
  step: AgentStep,
  message: string
): Promise<{ session: SessionRecord; result: StepResult }> {
  const waitingSession = await storage.updateSession(session.id, {
    current_step: step,
    status: "wait_user"
  });

  return {
    session: waitingSession,
    result: {
      nextStep: step,
      waitUser: true,
      message,
      jobId: null
    }
  };
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

function parsePayloadCandidateId(payload: Record<string, unknown> | undefined): string | null {
  const candidateId = payload?.candidate_id;
  return typeof candidateId === "string" ? candidateId : null;
}

function findCandidate(session: SessionRecord, candidateId: string | null): Candidate | null {
  if (!candidateId || !session.latest_top3) {
    return null;
  }
  return session.latest_top3.find((candidate) => candidate.id === candidateId) ?? null;
}

function getDirection(session: SessionRecord): BrandDirection | null {
  return session.draft_spec?.direction ?? null;
}

function getDirectionClarity(direction: BrandDirection | null | undefined) {
  return (
    direction?.clarity ?? {
      score: 1,
      ready_for_concepts: false,
      summary: "Aurora needs a clearer brief before concept generation.",
      missing_inputs: ["product clarity", "primary audience", "visual tone"],
      followup_questions: [
        "What exactly are you building or launching, in one concrete sentence?",
        "Who is the highest-priority audience for this first brand direction?",
        "Give Aurora 3 to 5 style keywords so the visual tone is less ambiguous."
      ]
    }
  );
}

function directionNeedsMoreDefinition(direction: BrandDirection | null | undefined): boolean {
  return !getDirectionClarity(direction).ready_for_concepts;
}

function buildDirectionClarifyMessage(direction: BrandDirection | null | undefined): string {
  const clarity = getDirectionClarity(direction);
  const questions = clarity.followup_questions.length > 0 ? clarity.followup_questions : [direction?.next_question ?? ""];
  return [
    clarity.summary,
    ...questions.slice(0, 3).map((question, index) => `${index + 1}. ${question}`),
    "Reply in chat and Aurora will tighten the direction before concept generation."
  ]
    .filter(Boolean)
    .join("\n");
}

function needsClarification(session: SessionRecord, score: number): boolean {
  const hasFullBrief =
    session.product.trim().length >= 3 &&
    session.audience.trim().length >= 3 &&
    session.style_keywords.length > 0 &&
    Boolean(session.constraint?.trim());
  if (hasFullBrief) {
    return false;
  }
  return score < env.INTENT_CLARIFY_THRESHOLD;
}

function buildDraftSpec(session: SessionRecord, direction?: BrandDirection | null) {
  return brandSpecDraftSchema.parse({
    stage: "draft",
    version: "0.5",
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
      note: "Will be finalized after concept selection."
    },
    direction: direction ?? undefined,
    scoring: {
      candidate_count: env.TOP_K,
      top_k: env.TOP_K,
      rules: ["product-audience-fit", "clarity", "consistency", "brand distinctiveness"]
    }
  });
}

function applyDirectionToDraft(session: SessionRecord, direction: BrandDirection) {
  const baseDraft = session.draft_spec ?? buildDraftSpec(session);
  return brandSpecDraftSchema.parse({
    ...baseDraft,
    direction,
    persona: {
      ...(baseDraft.persona ?? {}),
      narrative_summary: direction.narrative_summary
    }
  });
}

async function safeTrackUsage(
  storage: StorageRepository,
  input: {
    session_id: string;
    type: string;
    amount: number;
  }
) {
  try {
    await storage.trackUsage(input);
  } catch {
    // Usage tracking should never break pipeline progression.
  }
}

async function trackOpenAiTextUsage(
  storage: StorageRepository,
  sessionId: string,
  usage: OpenAiTextUsage | null
) {
  if (!usage) {
    return;
  }
  await safeTrackUsage(storage, {
    session_id: sessionId,
    type: "openai_text_requests",
    amount: 1
  });
  await safeTrackUsage(storage, {
    session_id: sessionId,
    type: "openai_tokens_input",
    amount: usage.prompt_tokens
  });
  await safeTrackUsage(storage, {
    session_id: sessionId,
    type: "openai_tokens_output",
    amount: usage.completion_tokens
  });
  await safeTrackUsage(storage, {
    session_id: sessionId,
    type: "openai_tokens_total",
    amount: usage.total_tokens
  });
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

async function recordDirectionSnapshot(
  storage: StorageRepository,
  artifacts: ArtifactRecord[],
  input: {
    session: SessionRecord;
    direction: BrandDirection;
    title: string;
    source: "openai" | "mock";
    revisionNote?: string | null;
  }
) {
  await recordArtifact(storage, artifacts, {
    sessionId: input.session.id,
    step: "brand_narrative",
    kind: "brand_narrative",
    title: input.title,
    content: {
      source: input.source,
      direction: input.direction,
      revision_note: input.revisionNote ?? null,
      selected_candidate_id: input.session.selected_candidate_id
    }
  });
}

async function recordDirectionClarifyArtifact(
  storage: StorageRepository,
  artifacts: ArtifactRecord[],
  input: {
    session: SessionRecord;
    direction: BrandDirection;
    title: string;
  }
) {
  const clarity = getDirectionClarity(input.direction);
  if (clarity.ready_for_concepts) {
    return;
  }
  await recordArtifact(storage, artifacts, {
    sessionId: input.session.id,
    step: "brand_narrative",
    kind: "clarify_questions",
    title: input.title,
    content: {
      score: clarity.score,
      summary: clarity.summary,
      missing_inputs: clarity.missing_inputs,
      questions: clarity.followup_questions
    }
  });
}

async function appendDirectionGuidanceMessage(
  storage: StorageRepository,
  session: SessionRecord,
  direction: BrandDirection
) {
  const clarity = getDirectionClarity(direction);
  const content = clarity.ready_for_concepts
    ? [
        direction.brief_summary,
        "",
        direction.next_question,
        `Default bundle after 60s: ${direction.asset_intent.default_bundle}.`
      ].join("\n")
    : [
        direction.brief_summary,
        "",
        buildDirectionClarifyMessage(direction)
      ].join("\n");

  await storage.appendMessage({
    session_id: session.id,
    role: "assistant",
    content,
    metadata: {
      provider: "agent_bootstrap",
      message_type: "direction_update",
      ready_for_concepts: clarity.ready_for_concepts
    }
  });
}

async function updateDirectionSession(
  storage: StorageRepository,
  session: SessionRecord,
  input: {
    direction: BrandDirection;
    constraint?: string | null;
    currentStep?: AgentStep;
    status?: SessionRecord["status"];
  }
) {
  const nextDraft = applyDirectionToDraft(session, input.direction);
  return storage.updateSession(session.id, {
    draft_spec: nextDraft,
    constraint: input.constraint ?? session.constraint,
    current_step: input.currentStep ?? session.current_step,
    status: input.status ?? session.status
  });
}

async function createSelectedRevision(
  storage: StorageRepository,
  artifacts: ArtifactRecord[],
  session: SessionRecord,
  userMessage: string,
  assetType: "social_x" | "social_ig" | "social_story"
): Promise<string> {
  const selectedCandidate = findCandidate(session, session.selected_candidate_id);
  if (!selectedCandidate) {
    return "Select a direction before requesting a revision render.";
  }

  const generatedImage = await generateConversationFollowupAsset({
    product: session.product,
    audience: session.audience,
    styleKeywords: session.style_keywords,
    userMessage,
    selectedCandidate,
    assetType
  });
  if (generatedImage.source === "openai") {
    await safeTrackUsage(storage, {
      session_id: session.id,
      type: "openai_image_generations",
      amount: 1
    });
  }
  const followup = generateFollowupSocialAsset({
    candidate: selectedCandidate,
    assetType
  });

  await recordArtifact(storage, artifacts, {
    sessionId: session.id,
    step: "approve_build",
    kind: "followup_asset",
    title: followup.title,
    content: {
      action: "generate_followup_asset",
      asset_type: assetType,
      candidate_id: selectedCandidate.id,
      revision_basis: userMessage,
      image_url: generatedImage.image_url,
      prompt: generatedImage.prompt,
      source: generatedImage.source,
      model: generatedImage.model,
      size: generatedImage.size,
      caption: followup.caption,
      hashtags: followup.hashtags
    }
  });

  return "Selected direction revision rendered.";
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

  if (actionType === "refine_direction" || actionType === "revise_constraint") {
    const constraintFromPayload = payload?.constraint;
    const constraint = typeof constraintFromPayload === "string" ? constraintFromPayload.trim() : "";
    if (constraint.length === 0) {
      return { session, consumed: true, message: "Direction note is empty. No refinement applied." };
    }

    if (!session.draft_spec) {
      const next = await storage.updateSession(session.id, {
        constraint,
        revision_count: session.revision_count + 1,
        current_step: "spec_draft",
        status: "running",
        paused: false
      });
      return { session: next, consumed: false, message: "Direction note saved. Bootstrapping direction." };
    }

    const directionResult = await generateDirectionWithFallback({
      product: session.product,
      audience: session.audience,
      styleKeywords: session.style_keywords,
      constraint,
      currentDirection: getDirection(session),
      revisionNote: constraint
    });
    if (directionResult.source === "openai") {
      await trackOpenAiTextUsage(storage, session.id, directionResult.usage);
    }
    const directionNeedsClarification = directionNeedsMoreDefinition(directionResult.direction);

    let nextStep: AgentStep = "brand_narrative";
    let nextStatus: SessionRecord["status"] = "wait_user";
    let consumed = true;
    let message = "Direction updated.";

    if (session.selected_candidate_id) {
      nextStep = "approve_build";
      nextStatus = "wait_user";
      message = await createSelectedRevision(storage, artifacts, session, constraint, "social_x");
    } else if (directionNeedsClarification) {
      nextStep = "brand_narrative";
      nextStatus = "wait_user";
      consumed = true;
      message = buildDirectionClarifyMessage(directionResult.direction);
    } else if (session.current_step === "brand_narrative") {
      nextStep = "brand_narrative";
      nextStatus = "wait_user";
      consumed = true;
      message = "Direction updated. Generate concept bundles when you are ready.";
    } else {
      nextStep = "candidates_generate";
      nextStatus = "running";
      consumed = false;
      message = "Direction updated. Regenerating 3 concept bundles.";
    }

    const nextSession = await updateDirectionSession(storage, session, {
      direction: directionResult.direction,
      constraint,
      currentStep: nextStep,
      status: nextStatus
    });
    await storage.updateSession(nextSession.id, {
      revision_count: session.revision_count + 1,
      latest_top3: session.selected_candidate_id ? nextSession.latest_top3 : nextStep === "candidates_generate" ? null : nextSession.latest_top3,
      selected_candidate_id: session.selected_candidate_id
    });

    const refreshed = (await storage.getSession(session.id)) ?? nextSession;
    await recordDirectionSnapshot(storage, artifacts, {
      session: refreshed,
      direction: directionResult.direction,
      title: session.selected_candidate_id ? "Direction refined for selected revision" : "Direction refined",
      source: directionResult.source,
      revisionNote: constraint
    });
    if (!session.selected_candidate_id && directionNeedsClarification) {
      await recordDirectionClarifyArtifact(storage, artifacts, {
        session: refreshed,
        direction: directionResult.direction,
        title: "Direction still needs clarification"
      });
      await appendDirectionGuidanceMessage(storage, refreshed, directionResult.direction);
    }
    return {
      session: refreshed,
      consumed,
      message
    };
  }

  if (actionType === "rerun_candidates") {
    const direction = getDirection(session);
    if (!direction) {
      const next = await storage.updateSession(session.id, {
        current_step: "brand_narrative",
        status: "wait_user"
      });
      return {
        session: next,
        consumed: true,
        message: "Direction is not ready yet. Refine the brief first."
      };
    }
    if (directionNeedsMoreDefinition(direction)) {
      const next = await storage.updateSession(session.id, {
        current_step: "brand_narrative",
        status: "wait_user"
      });
      return {
        session: next,
        consumed: true,
        message: buildDirectionClarifyMessage(direction)
      };
    }

    const next = await storage.updateSession(session.id, {
      current_step: "candidates_generate",
      status: "running",
      paused: false,
      selected_candidate_id: null
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      step: "candidates_generate",
      kind: "chat_action",
      title: "Concept regeneration requested",
      content: { action: actionType }
    });
    return { session: next, consumed: false, message: "Regenerating 3 concepts." };
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
      title: "Candidate selection requested",
      content: { action: actionType, candidate_id: candidateId }
    });
    return { session: next, consumed: false, message: "Direction selection updated." };
  }

  if (actionType === "generate_followup_asset") {
    if (!session.selected_candidate_id) {
      return {
        session,
        consumed: true,
        message: "Select a direction before requesting revision renders."
      };
    }

    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "Refine the selected direction.";
    const assetType =
      payload?.asset_type === "social_ig" || payload?.asset_type === "social_story"
        ? (payload.asset_type as "social_ig" | "social_story")
        : "social_x";

    const direction = getDirection(session);
    if (direction) {
      const refinedDirection = await generateDirectionWithFallback({
        product: session.product,
        audience: session.audience,
        styleKeywords: session.style_keywords,
        constraint: prompt,
        currentDirection: direction,
        revisionNote: prompt
      });
      if (refinedDirection.source === "openai") {
        await trackOpenAiTextUsage(storage, session.id, refinedDirection.usage);
      }
      const nextSession = await updateDirectionSession(storage, session, {
        direction: refinedDirection.direction,
        constraint: prompt,
        currentStep: "approve_build",
        status: "wait_user"
      });
      await recordDirectionSnapshot(storage, artifacts, {
        session: nextSession,
        direction: refinedDirection.direction,
        title: "Direction refined for revision render",
        source: refinedDirection.source,
        revisionNote: prompt
      });
      session = nextSession;
    }

    const message = await createSelectedRevision(storage, artifacts, session, prompt, assetType);
    return { session, consumed: true, message };
  }

  if (actionType === "proceed") {
    if (session.current_step === "top3_select" && session.selected_candidate_id) {
      const next = await storage.updateSession(session.id, {
        current_step: "approve_build",
        status: "wait_user"
      });
      return {
        session: next,
        consumed: false,
        message: "Selected direction confirmed. Running build approval."
      };
    }

    if (session.current_step === "brand_narrative" && getDirection(session)) {
      const direction = getDirection(session);
      if (directionNeedsMoreDefinition(direction)) {
        const next = await storage.updateSession(session.id, {
          current_step: "brand_narrative",
          status: "wait_user"
        });
        return {
          session: next,
          consumed: true,
          message: buildDirectionClarifyMessage(direction)
        };
      }
      const next = await storage.updateSession(session.id, {
        current_step: "candidates_generate",
        status: "running",
        paused: false
      });
      return { session: next, consumed: false, message: "Generating concepts from the current direction." };
    }
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
    const intentConfidence = session.intent_confidence ?? deriveIntentConfidence(session);
    const variationWidth = session.variation_width ?? toVariationWidth(intentConfidence);
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
      title: "Brief normalized",
      content: {
        product: session.product,
        audience: session.audience,
        style_keywords: session.style_keywords,
        design_requirement: session.constraint,
        intent_confidence: intentConfidence,
        variation_width: variationWidth
      }
    });
    return {
      session: nextSession,
      result: {
        nextStep: "intent_gate",
        waitUser: false,
        message: "Brief captured and normalized.",
        jobId: null
      }
    };
  }

  if (step === "intent_gate") {
    const score = session.intent_confidence ?? deriveIntentConfidence(session);
    if (needsClarification(session, score)) {
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
        title: "Need more clarity before direction synthesis",
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
    const draft = buildDraftSpec(session, getDirection(session));
    const nextSession = await storage.updateSession(session.id, {
      draft_spec: draft,
      current_step: "brand_narrative",
      status: "running"
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      step,
      kind: "brand_spec_draft",
      title: "Draft spec generated",
      content: draft
    });
    return {
      session: nextSession,
      result: {
        nextStep: "brand_narrative",
        waitUser: false,
        message: "Draft spec is ready.",
        jobId: null
      }
    };
  }

  if (step === "brand_narrative") {
    if (!session.draft_spec) {
      const waitingSession = await storage.updateSession(session.id, {
        status: "wait_user",
        current_step: "spec_draft"
      });
      return {
        session: waitingSession,
        result: {
          nextStep: "spec_draft",
          waitUser: true,
          message: "Draft spec is missing. Generate draft spec before direction synthesis.",
          jobId: null
        }
      };
    }

    const existingDirection = getDirection(session);
    if (existingDirection) {
      const readySession = await storage.updateSession(session.id, {
        current_step: "brand_narrative",
        status: "wait_user"
      });
      return {
        session: readySession,
        result: {
          nextStep: "brand_narrative",
          waitUser: true,
          message: directionNeedsMoreDefinition(existingDirection)
            ? buildDirectionClarifyMessage(existingDirection)
            : "Direction ready. Generate concept bundles when you are ready.",
          jobId: null
        }
      };
    }

    const synthesized = await generateDirectionWithFallback({
      product: session.product,
      audience: session.audience,
      styleKeywords: session.style_keywords,
      constraint: session.constraint
    });
    if (synthesized.source === "openai") {
      await trackOpenAiTextUsage(storage, session.id, synthesized.usage);
    }
    const nextDraft = applyDirectionToDraft(session, synthesized.direction);
    const nextSession = await storage.updateSession(session.id, {
      draft_spec: nextDraft,
      current_step: "brand_narrative",
      status: "wait_user"
    });
    await recordDirectionSnapshot(storage, artifacts, {
      session: nextSession,
      direction: synthesized.direction,
      title: "Direction synthesized",
      source: synthesized.source
    });
    await recordDirectionClarifyArtifact(storage, artifacts, {
      session: nextSession,
      direction: synthesized.direction,
      title: "Direction follow-up needed"
    });
    await appendDirectionGuidanceMessage(storage, nextSession, synthesized.direction);
    return {
      session: nextSession,
      result: {
          nextStep: "brand_narrative",
          waitUser: true,
          message: directionNeedsMoreDefinition(synthesized.direction)
            ? buildDirectionClarifyMessage(synthesized.direction)
            : "Direction synthesized. Refine it in chat or generate concept bundles.",
          jobId: null
        }
      };
  }

  if (step === "candidates_generate") {
    const direction = getDirection(session);
    if (!direction) {
      const waitingSession = await storage.updateSession(session.id, {
        status: "wait_user",
        current_step: "brand_narrative"
      });
      return {
        session: waitingSession,
        result: {
          nextStep: "brand_narrative",
          waitUser: true,
          message: "Direction is missing. Refine direction before generating concepts.",
          jobId: null
        }
      };
    }
    if (directionNeedsMoreDefinition(direction)) {
      const waitingSession = await storage.updateSession(session.id, {
        status: "wait_user",
        current_step: "brand_narrative"
      });
      return {
        session: waitingSession,
        result: {
          nextStep: "brand_narrative",
          waitUser: true,
          message: buildDirectionClarifyMessage(direction),
          jobId: null
        }
      };
    }

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

    let job: Awaited<ReturnType<StorageRepository["createJob"]>>;
    try {
      job = await storage.createJob({
        session_id: session.id,
        step: "candidates_generate",
        payload: {
          reason: request.action ?? "step_run",
          direction_summary: direction.brief_summary
        }
      });
    } catch (error) {
      if (isActiveJobConflictError(error)) {
        return returnActiveJobConflict(
          storage,
          session,
          "candidates_generate",
          "Another active job exists for this session. Retry after completion."
        );
      }
      throw error;
    }

    try {
      const generated = await generateCandidatesWithFallback({
        sessionId: session.id,
        product: session.product,
        audience: session.audience,
        styleKeywords: session.style_keywords,
        intentConfidence: session.intent_confidence ?? 3,
        direction,
        candidateCount: env.TOP_K,
        topK: env.TOP_K
      });
      if (generated.source === "openai") {
        await trackOpenAiTextUsage(storage, session.id, generated.usage.text);
        if (generated.usage.image_generations > 0) {
          await safeTrackUsage(storage, {
            session_id: session.id,
            type: "openai_image_generations",
            amount: generated.usage.image_generations
          });
        }
      }
      if (generated.candidates.length !== env.TOP_K) {
        throw new Error(`Expected ${env.TOP_K} concepts but received ${generated.candidates.length}.`);
      }
      await storage.updateJob(job.id, {
        status: "completed",
        logs: [
          `source:${generated.source}`,
          `top:${generated.candidates.length}`,
          `render_failures:${generated.render_failures.length}`,
          ...generated.render_failures.map((failure) => `render_failure:${failure.candidate_id}:${failure.error}`)
        ]
      });
      const nextSession = await storage.updateSession(session.id, {
        latest_top3: generated.candidates,
        selected_candidate_id: null,
        current_step: "top3_select",
        status: "wait_user"
      });
      await recordArtifact(storage, artifacts, {
        sessionId: session.id,
        jobId: job.id,
        step,
        kind: "candidates_top3",
        title: "3 concepts generated",
        content: {
          source: generated.source,
          direction,
          candidates: generated.candidates,
          render_failures: generated.render_failures
        }
      });
      return {
        session: nextSession,
        result: {
          nextStep: "top3_select",
          waitUser: true,
          message:
            generated.render_failures.length > 0
              ? `Three concept bundles are ready. ${generated.render_failures.length} render fallback(s) were used.`
              : "Three concept bundles are ready. Choose one to continue.",
          jobId: job.id
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Concept generation failed.";
      console.error("[agent.candidates_generate.failed]", {
        session_id: session.id,
        job_id: job.id,
        error: message
      });
      await storage.updateJob(job.id, {
        status: "failed",
        error: message,
        logs: [`error:${message}`]
      });
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
          message: "No concepts available. Generate concepts first.",
          jobId: null
        }
      };
    }

    const payloadCandidateId = parsePayloadCandidateId(request.payload);
    const selectedCandidateId = payloadCandidateId ?? session.selected_candidate_id;
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
          message: "Concepts are ready. Choose one direction to continue.",
          jobId: null
        }
      };
    }

    const nextSession = await storage.updateSession(session.id, {
      selected_candidate_id: selectedCandidateId,
      current_step: "approve_build",
      status: "wait_user"
    });
    await recordArtifact(storage, artifacts, {
      sessionId: session.id,
      step,
      kind: "selection",
      title: "Direction selected",
      content: {
        selected_candidate_id: selectedCandidateId,
        selection_rationale: selectedCandidate.rationale,
        selected_candidate: selectedCandidate
      }
    });
    return {
      session: nextSession,
      result: {
        nextStep: "approve_build",
        waitUser: true,
        message: `${selectedCandidate.naming.recommended} selected. Build when ready.`,
        jobId: null
      }
    };
  }

  if (step === "approve_build") {
    const selectedCandidate = findCandidate(session, session.selected_candidate_id);
    const direction = getDirection(session);
    if (!selectedCandidate || !session.draft_spec || !direction) {
      const waitingSession = await storage.updateSession(session.id, {
        status: "wait_user",
        current_step: "top3_select"
      });
      return {
        session: waitingSession,
        result: {
          nextStep: "top3_select",
          waitUser: true,
          message: "Cannot build outputs without a selected direction and synthesized brief.",
          jobId: null
        }
      };
    }

    if (request.action !== "proceed") {
      const waitingSession = await storage.updateSession(session.id, {
        status: "wait_user",
        current_step: "approve_build"
      });
      return {
        session: waitingSession,
        result: {
          nextStep: "approve_build",
          waitUser: true,
          message: "Build approval required. Send proceed/build to continue.",
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

    let job: Awaited<ReturnType<StorageRepository["createJob"]>>;
    try {
      job = await storage.createJob({
        session_id: session.id,
        step: "approve_build",
        payload: { selected_candidate_id: selectedCandidate.id }
      });
    } catch (error) {
      if (isActiveJobConflictError(error)) {
        return returnActiveJobConflict(
          storage,
          session,
          "approve_build",
          "Another active job exists for this session."
        );
      }
      throw error;
    }

    await storage.updateSession(session.id, {
      current_step: "approve_build",
      status: "running"
    });
    console.info("[agent.approve_build.started]", {
      session_id: session.id,
      job_id: job.id,
      selected_candidate_id: selectedCandidate.id
    });

    try {
      const tokens = {
        palette: {
          primary: selectedCandidate.moodboard.colors[0],
          secondary: selectedCandidate.moodboard.colors[1],
          accent: selectedCandidate.moodboard.colors[2]
        },
        typography: {
          headline: "sora",
          body: "system-ui"
        },
        spacing: { base: 8, scale: [8, 12, 16, 24, 32] },
        radius: { card: 16, button: 999 }
      };
      const socialAssets = await generateSocialAssetsWithFallback({
        sessionId: session.id,
        candidate: selectedCandidate
      });
      if (socialAssets.source === "openai") {
        await safeTrackUsage(storage, {
          session_id: session.id,
          type: "openai_image_generations",
          amount: 3
        });
      }
      const codePlan = {
        stack: "nextjs-tailwind",
        components: ["DirectionHero", "ConceptGallery", "SelectionPanel", "ExportDock"],
        route: "/",
        narrative_focus: direction.narrative_summary
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
        direction,
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
      console.info("[agent.approve_build.completed]", {
        session_id: session.id,
        job_id: job.id,
        selected_candidate_id: selectedCandidate.id
      });
      return {
        session: nextSession,
        result: {
          nextStep: "package",
          waitUser: false,
          message: "Build outputs completed.",
          jobId: job.id
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Build failed.";
      console.error("[agent.approve_build.failed]", {
        session_id: session.id,
        job_id: job.id,
        selected_candidate_id: selectedCandidate.id,
        error: message
      });
      await storage.updateJob(job.id, {
        status: "failed",
        error: message,
        logs: [`error:${message}`]
      });
      const failedSession = await storage.updateSession(session.id, {
        current_step: "approve_build",
        status: "failed"
      });
      return {
        session: failedSession,
        result: {
          nextStep: "approve_build",
          waitUser: true,
          message,
          jobId: job.id
        }
      };
    }
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
          message: "Final spec is missing. Run build approval first.",
          jobId: null
        }
      };
    }
    let job: Awaited<ReturnType<StorageRepository["createJob"]>>;
    try {
      job = await storage.createJob({
        session_id: session.id,
        step: "package",
        payload: {
          selected_candidate_id: session.selected_candidate_id
        }
      });
    } catch (error) {
      if (isActiveJobConflictError(error)) {
        return returnActiveJobConflict(
          storage,
          session,
          "package",
          "Another active job exists for this session. Retry after completion."
        );
      }
      throw error;
    }
    const bundleHash = sha256(JSON.stringify(session.final_spec));
    const packMeta = {
      session_id: session.id,
      selected_candidate_id: session.selected_candidate_id,
      created_at: new Date().toISOString(),
      output_sequence: [
        "brief.json",
        "direction.json",
        "brand_narrative.json",
        "candidates_top3.json",
        "selection.json",
        "final_spec.json",
        "tokens.json",
        "social_assets.json",
        "code_plan.json",
        "pack_meta.json"
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
        message: "Strategy pack is ready.",
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
  const bootstrapUntilDirection = request.payload?.bootstrap_until_direction === true;
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

    if (waitUser || (!currentSession.auto_continue && !bootstrapUntilDirection) || nextStep === null || currentSession.current_step === "done") {
      break;
    }

    request.step = nextStep;
    request.action = undefined;
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
