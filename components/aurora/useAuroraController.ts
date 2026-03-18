"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  AGENT_STEPS,
  type ArtifactRecord,
  type ChatEntry,
  type CommandExecutionResult,
  type GuidedActionId,
  type JobsPayload,
  type ModelSource,
  type QueuedCommand,
  type QuickActionId,
  type RightPanelViewModel,
  type RuntimeGoalSnapshot,
  type Scene,
  type SessionPayload,
  resolveSceneFromStep
} from "./types";
import { resolveGuidedActionViewModel } from "./guided-actions";
import {
  buildSlashHelpText,
  parseSlashCommand,
  validateSlashCommandContext
} from "./slash-commands";
import {
  composeStructuredBriefConstraint,
  parseStructuredBriefConstraint
} from "../../lib/brief-structure";
import { getSupabaseBrowserClient } from "../../lib/auth/supabase-client";
import type { DirectionClarity } from "./types";

class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type RequestInitWithBody = RequestInit & {
  body?: string;
};

type RequestJsonFn = <T>(url: string, init?: RequestInitWithBody) => Promise<T>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed";
}

function nowIso(): string {
  return new Date().toISOString();
}

function containsSchemaValidationNoise(content: string): boolean {
  return (
    content.includes("invalid_type") ||
    content.includes("Expected object, received") ||
    (content.includes("candidates") && content.includes("ui_plan"))
  );
}

function summarizeMessageForTimeline(input: { role: "user" | "assistant" | "system"; content: string }): string {
  const raw = input.content?.trim() ?? "";
  if (raw.length === 0) {
    return raw;
  }

  if (input.role !== "user" && containsSchemaValidationNoise(raw)) {
    return [
      "후보 생성 단계에서 스키마 검증 실패가 발생했습니다.",
      "추천: Generate 3 Concepts를 다시 눌러 재시도하세요.",
      "상세 오류는 좌측 Setup/Runtime의 Latest failure details에서 확인할 수 있습니다."
    ].join("\n");
  }

  if (input.role !== "user" && raw.length > 640) {
    return `${raw.slice(0, 640)}...`;
  }
  return raw;
}

function summarizeArtifactForTimeline(artifact: ArtifactRecord): { content: string; subtitle: string } {
  if (artifact.kind === "brand_narrative") {
    const direction = artifact.content?.direction;
    const directionRecord =
      direction && typeof direction === "object" ? (direction as { brief_summary?: string }) : null;
    const summary =
      typeof directionRecord?.brief_summary === "string"
        ? directionRecord.brief_summary
        : artifact.title;
    return {
      content: summary,
      subtitle: "direction update"
    };
  }

  if (artifact.kind === "candidates_top3") {
    return {
      content: "Three concept bundles are ready for comparison.",
      subtitle: "concept render"
    };
  }

  if (artifact.kind === "followup_asset") {
    return {
      content: artifact.title,
      subtitle: "selected revision"
    };
  }

  return {
    content: artifact.title,
    subtitle: artifact.kind
  };
}

export type ChatApiResponse = {
  runtime_meta?: {
    goal_id?: string;
  };
  assistant_source?: "openai" | "rate_limited" | "fallback";
  rate_limited?: boolean;
  rate_limit?: {
    limit: number;
    used: number;
    remaining: number;
  };
};

type SendChatAndSyncInput = {
  sessionId: string | null;
  runtimeGoalId: string | null;
  message: string;
  requestJson: RequestJsonFn;
  setRuntimeGoalId: (goalId: string) => void;
  refreshRuntimeGoal: (goalId: string) => Promise<void>;
  refreshSession: (sessionId: string) => Promise<void>;
};

export async function sendChatAndSync(input: SendChatAndSyncInput): Promise<ChatApiResponse> {
  if (!input.sessionId) {
    return {};
  }

  const response = await input.requestJson<ChatApiResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      session_id: input.sessionId,
      message: input.message
    })
  });

  if (response.runtime_meta?.goal_id) {
    input.setRuntimeGoalId(response.runtime_meta.goal_id);
    await input.refreshRuntimeGoal(response.runtime_meta.goal_id);
  } else if (input.runtimeGoalId) {
    await input.refreshRuntimeGoal(input.runtimeGoalId);
  }
  await input.refreshSession(input.sessionId);
  return response;
}

export function getCommandExecutionMeta(response: ChatApiResponse | null | undefined): Pick<CommandExecutionResult, "assistantSource" | "rateLimited"> {
  return {
    assistantSource: response?.assistant_source,
    rateLimited: response?.rate_limited
  };
}

type SetupField = "product" | "audience" | "deliverable" | "style" | "q0" | "note";

type ParsedSetupCommand = {
  field: SetupField;
  value: string;
};

function parseSetupCommand(raw: string): ParsedSetupCommand | null {
  const trimmed = raw.trim();
  const match = /^\/setup\s+(product|audience|deliverable|style|q0|note)\s+(.+)$/i.exec(trimmed);
  if (!match) {
    return null;
  }
  return {
    field: match[1].toLowerCase() as SetupField,
    value: match[2].trim()
  };
}

function getDirectionClarityFromPayload(payload: SessionPayload | null): DirectionClarity | null {
  return payload?.session.draft_spec?.direction?.clarity ?? null;
}

function buildDefineClarifyMessage(payload: SessionPayload | null): string {
  const clarity = getDirectionClarityFromPayload(payload);
  if (!clarity || clarity.ready_for_concepts) {
    return "DEFINE 단계입니다. 방향을 점검한 뒤 Generate 3 Concepts로 EXPLORE로 넘어가세요.";
  }

  const firstQuestion = clarity.followup_questions[0];
  return firstQuestion
    ? `DEFINE 단계입니다. 아직 후보 생성으로 넘어가기엔 brief가 부족합니다. 먼저 이 질문에 답하세요: ${firstQuestion}`
    : "DEFINE 단계입니다. Aurora가 방향을 더 명확히 하기 위해 추가 답변을 기다리고 있습니다.";
}

function buildStageGuideMessage(stage: string, payload: SessionPayload | null): string {
  const status = payload?.session.status;
  if (status === "failed" && stage === "candidates_generate") {
    return "EXPLORE 후보 생성이 실패했습니다. Generate 3 Concepts를 다시 눌러 재시도하고, 상세 오류는 Latest failure details에서 확인하세요.";
  }

  if (stage === "brand_narrative") {
    return buildDefineClarifyMessage(payload);
  }

  if (stage === "top3_select") {
    const candidates = (payload?.latest_top3 ?? []).slice(0, 3);
    const optionLines = candidates.map((candidate, index) => {
      return `- 후보 ${index + 1}: ${candidate.naming.recommended} (${candidate.narrative_summary.slice(0, 52)})`;
    });
    optionLines.push("- 카드에서 하나를 고르거나 채팅에 'pick 1'처럼 입력하면 다음 단계로 넘어갑니다.");
    optionLines.push("- 수정 지시는 자연어로 보내면 Aurora가 후보 필드를 다시 정리합니다.");
    return `EXPLORE 선택 단계입니다.\n${optionLines.join("\n")}`;
  }

  if (stage === "approve_build") {
    return "DECIDE 단계입니다. 선택한 방향이 맞다면 Build Final Outputs를 누르고, 더 다듬고 싶다면 채팅으로 수정 지시를 보내세요.";
  }

  if (stage === "package" || stage === "done") {
    return "PACKAGE 단계입니다. 산출물을 확인한 뒤 Export Pack으로 내보내거나, 필요하면 outputs를 다시 생성할 수 있습니다.";
  }

  if (stage === "candidates_generate") {
    return "EXPLORE 단계입니다. Direction을 기준으로 primary concept image + supporting asset bundle 3개를 생성하고 있습니다.";
  }

  return "다음 단계는 화면의 Next Action 카드에서 진행하고, 방향 수정은 채팅에 자연어로 바로 적어주세요.";
}

function buildPostCommandGuide(commandId: string, stage: string | null | undefined): string {
  if (commandId === "run_step" && stage === "brand_narrative") {
    return "Next: Aurora is rendering 3 concept bundles. Compare them when they appear, then choose one route.";
  }
  if (commandId === "run_step" && stage === "top3_select") {
    return "Next: Aurora is moving into build. Review the locked route, then wait for PACKAGE outputs.";
  }
  if (commandId === "confirm_build") {
    return "Next: wait for PACKAGE outputs to finish, then export the pack when it is ready.";
  }
  if (commandId === "regenerate_top3") {
    return "Next: compare the refreshed bundles in EXPLORE and pick the strongest route.";
  }
  if (commandId === "regenerate_outputs") {
    return "Next: review the refreshed PACKAGE outputs and export when the pack is ready.";
  }
  if (commandId === "pick_1" || commandId === "pick_2" || commandId === "pick_3") {
    return "Next: review the locked direction in DECIDE, then build final outputs when you are ready.";
  }
  if (commandId === "export_zip") {
    return "Next: check the exported pack and return to PACKAGE only if another regeneration is needed.";
  }
  return "Next: watch the updated scene state on the left canvas and follow the primary action when it appears.";
}

type StructuredChatCommandId = "pick_1" | "pick_2" | "pick_3" | "regenerate_top3";
type ChatGuidanceIntent = "question" | "blocked" | "approval" | "revision" | "general";

function normalizeStructuredChatCommand(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveStructuredChatCommandId(message: string): StructuredChatCommandId | null {
  const normalized = normalizeStructuredChatCommand(message);
  if (normalized === "pick 1") {
    return "pick_1";
  }
  if (normalized === "pick 2") {
    return "pick_2";
  }
  if (normalized === "pick 3") {
    return "pick_3";
  }
  if (normalized === "rerun candidates") {
    return "regenerate_top3";
  }
  return null;
}

export function classifyChatGuidanceIntent(message: string): ChatGuidanceIntent {
  const normalized = normalizeStructuredChatCommand(message);

  if (
    /\b(stuck|confused|blocked|not working|what now|next step|help)\b/.test(normalized) ||
    /(안돼|안 되|막혔|헷갈|모르겠|다음 뭐|뭘 해야|왜 안|안 넘어|안넘어)/.test(normalized)
  ) {
    return "blocked";
  }

  if (
    normalized.endsWith("?") ||
    /^(why|how|what|which|can|could|should|is|are|do we|does this)\b/.test(normalized) ||
    /^(왜|어떻게|뭐가|무엇|어디|가능|맞아|맞나요|될까)/.test(normalized)
  ) {
    return "question";
  }

  if (
    /^(ok|okay|looks good|good to go|go ahead|continue|proceed|ship it|approved|yes)\b/.test(normalized) ||
    /^(좋아|좋습니다|좋네|오케이|진행|넘어가|가자|해봐|확정|승인|응)/.test(normalized)
  ) {
    return "approval";
  }

  if (
    /\b(make|change|keep|reduce|increase|shift|revise|tweak|focus|emphasize|tone|color)\b/.test(normalized) ||
    /(수정|바꿔|바꿔줘|줄여|늘려|강조|톤|색|무드|정리|더|덜|유지)/.test(normalized)
  ) {
    return "revision";
  }

  return "general";
}

export function buildPostChatGuide(stage: string | null | undefined, message: string): string {
  const structuredCommandId = resolveStructuredChatCommandId(message);
  if (structuredCommandId) {
    return buildPostCommandGuide(structuredCommandId, stage);
  }

  const intent = classifyChatGuidanceIntent(message);

  if (stage === "brand_narrative") {
    if (intent === "approval") {
      return "Approval noted. Next: click Generate 3 Concepts when you are ready to move into EXPLORE.";
    }
    if (intent === "question") {
      return "Question sent. Next: Aurora will answer here, then you can decide whether to keep steering or generate concepts.";
    }
    if (intent === "blocked") {
      return "Block noted. Next: check the single Next Action card, then say exactly what still feels missing in one sentence.";
    }
    if (intent === "revision") {
      return "Direction steer sent. Next: Aurora will revise DEFINE. Review the updated snapshot, then generate concepts when it feels right.";
    }
    return "Note sent. Next: Aurora will update DEFINE. Review the direction, then move into EXPLORE when ready.";
  }

  if (stage === "candidates_generate" || stage === "top3_select") {
    if (intent === "question") {
      return "Question sent. Next: Aurora will answer here. Once the bundles settle, choose the route that best fits the brief.";
    }
    if (intent === "blocked") {
      return "Block noted. Next: wait for the concept field to finish, or refresh the set if the spread still feels off.";
    }
    if (intent === "approval") {
      return "Preference noted. Next: choose the strongest concept so Aurora can lock the route.";
    }
    if (intent === "revision") {
      return "Revision steer sent. Next: Aurora will adjust the concept field. Compare the updated bundles, then choose one route.";
    }
    return "Note sent. Next: review the concept bundles and choose the route worth taking forward.";
  }

  if (stage === "approve_build") {
    if (intent === "question") {
      return "Question sent. Next: Aurora will answer here. If the route still holds, build final outputs when you are ready.";
    }
    if (intent === "blocked") {
      return "Block noted. Next: either switch routes or send one more refinement before building final outputs.";
    }
    if (intent === "approval") {
      return "Approval noted. Next: click Build Final Outputs to move into PACKAGE.";
    }
    if (intent === "revision") {
      return "Revision steer sent. Next: Aurora will tighten the locked route. Review it once more before building.";
    }
    return "Note sent. Next: review the locked route and build final outputs when it is ready.";
  }

  if (stage === "package" || stage === "done") {
    if (intent === "question") {
      return "Question sent. Next: Aurora will answer here. Export once the outputs look ready.";
    }
    if (intent === "blocked") {
      return "Block noted. Next: say what still feels off, or refresh outputs before exporting.";
    }
    if (intent === "approval") {
      return "Approval noted. Next: export the pack when you are ready.";
    }
    if (intent === "revision") {
      return "Refresh note sent. Next: review the updated outputs, then export the pack.";
    }
    return "Request sent. Next: review PACKAGE updates here and export when the pack is ready.";
  }

  return intent === "blocked"
    ? "Block noted. Next: check the Next Action card on the left and follow the single recommended step."
    : "Request sent. Next: watch the scene update on the left canvas.";
}

export function inferChatSceneTransition(message: string): { scene: Scene; stage: string; message: string } | null {
  const commandId = resolveStructuredChatCommandId(message);
  if (commandId === "regenerate_top3") {
    return {
      scene: "EXPLORE",
      stage: "candidates_generate",
      message: "Generating 3 concept bundles from the current direction."
    };
  }
  if (commandId === "pick_1" || commandId === "pick_2" || commandId === "pick_3") {
    return {
      scene: "DECIDE",
      stage: "approve_build",
      message: "Locking the selected direction and preparing build approval."
    };
  }
  return null;
}

function summarizeFailureForTimeline(stage: string, errorMessage: string): string {
  if (stage === "candidates_generate" && containsSchemaValidationNoise(errorMessage)) {
    return "EXPLORE 후보 구조가 올바르지 않아 생성이 중단되었습니다. Generate 3 Concepts를 다시 눌러 재시도하세요.";
  }

  if (stage === "candidates_generate") {
    return "EXPLORE 후보 생성이 실패했습니다. Generate 3 Concepts를 다시 시도하거나 direction을 조금 더 구체적으로 정리하세요.";
  }

  if (stage === "approve_build" && /OpenAI image call failed/i.test(errorMessage)) {
    return "Build 미리보기 이미지 생성이 실패했습니다. 다시 시도하면 fallback asset으로 계속 진행할 수 있습니다.";
  }

  if (stage === "approve_build") {
    return "Build 출력 조합에 실패했습니다. 다시 시도하거나 최신 failure details를 확인하세요.";
  }

  return "이 단계에서 오류가 발생했습니다. 다시 시도하거나 입력을 조금 더 구체적으로 바꿔보세요.";
}

function readApiErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  if ("error" in body && typeof body.error === "string" && body.error.trim().length > 0) {
    return body.error.trim();
  }
  if ("message" in body && typeof body.message === "string" && body.message.trim().length > 0) {
    return body.message.trim();
  }
  return null;
}

function normalizeActionErrorMessage(
  error: unknown,
  context: {
    currentStep?: string | null;
    hasActiveJob?: boolean;
  } = {}
): string {
  const apiBodyMessage = error instanceof ApiError ? readApiErrorMessage(error.body) : null;
  const rawMessage = apiBodyMessage ?? toErrorMessage(error);
  const normalized = rawMessage.trim();

  if (/active job already exists for session/i.test(normalized)) {
    return "Aurora is already processing this session. Wait for the current job to finish, then continue.";
  }

  if (/Invalid run-step payload/i.test(normalized) || /Invalid runtime step payload/i.test(normalized)) {
    return "Aurora is still preparing the next stage. Wait a moment, then try again.";
  }

  if (/OpenAI image call failed/i.test(normalized) && context.currentStep === "candidates_generate") {
    return "Concept rendering failed while generating images. Retry once, then inspect the latest failure details.";
  }

  if (/OpenAI image call failed/i.test(normalized) && context.currentStep === "approve_build") {
    return "Build preview rendering failed. Retry once and Aurora will continue with fallback assets if needed.";
  }

  if (/OPENAI_API_KEY is required/i.test(normalized)) {
    return "OpenAI is not configured on this deployment, so Aurora can not answer yet.";
  }

  return normalized;
}

type RunStepRequestDecision =
  | {
      kind: "ready";
      body: {
        step?: string;
        action?: string;
        payload?: Record<string, unknown>;
      };
    }
  | {
      kind: "blocked";
      message: string;
      subtitle?: string;
    };

function resolveRunStepDecision(payload: SessionPayload | null, hasActiveJob: boolean): RunStepRequestDecision {
  if (!payload) {
    return {
      kind: "blocked",
      message: "Aurora is still loading this session. Wait a moment, then try again.",
      subtitle: "session loading"
    };
  }

  const currentStep = payload.session.current_step;
  const status = payload.session.status;
  const hasDirection = Boolean(payload.session.draft_spec?.direction);
  const directionClarity = getDirectionClarityFromPayload(payload);
  const top3Count = payload.latest_top3?.length ?? 0;
  const hasSelection = Boolean(payload.selected_candidate_id);

  if (status === "running" || hasActiveJob) {
    return {
      kind: "blocked",
      message: "Aurora is already processing the current stage. Wait for the active job to finish.",
      subtitle: "stage running"
    };
  }

  if (
    currentStep === "interview_collect" ||
    currentStep === "intent_gate" ||
    currentStep === "spec_draft" ||
    (currentStep === "brand_narrative" && !hasDirection)
  ) {
    return {
      kind: "ready",
      body: {
        step: "interview_collect",
        payload: {
          bootstrap_until_direction: true
        }
      }
    };
  }

  if (currentStep === "brand_narrative") {
    if (directionClarity?.ready_for_concepts === false) {
      return {
        kind: "blocked",
        message: buildDefineClarifyMessage(payload),
        subtitle: "clarification required"
      };
    }
    return {
      kind: "ready",
      body: {
        step: "candidates_generate"
      }
    };
  }

  if (currentStep === "candidates_generate") {
    return {
      kind: "blocked",
      message: "Concept generation is already in progress. Wait for Aurora to finish rendering the three options.",
      subtitle: "render in progress"
    };
  }

  if (currentStep === "top3_select") {
    if (top3Count === 0) {
      return {
        kind: "ready",
        body: {
          step: "candidates_generate"
        }
      };
    }

    if (!hasSelection) {
      return {
        kind: "blocked",
        message: "Pick one concept first. After selection, Aurora can continue to the build stage.",
        subtitle: "selection required"
      };
    }

    return {
      kind: "ready",
      body: {
        step: "approve_build",
        action: "proceed"
      }
    };
  }

  if (currentStep === "approve_build") {
    return {
      kind: "ready",
      body: {
        step: "approve_build",
        action: "proceed"
      }
    };
  }

  if (currentStep === "package" || currentStep === "done") {
    return {
      kind: "ready",
      body: {
        step: "package"
      }
    };
  }

  return {
    kind: "blocked",
    message: "This stage is not ready yet. Wait for Aurora to finish the current transition, then use the Next Action card.",
    subtitle: "stage not ready"
  };
}

type ActionFn = () => Promise<void>;
type OnboardingPhase = "setup" | "flipping" | "workspace";
type StartSessionResult = {
  ok: boolean;
  message?: string;
};

type SceneTransitionState = {
  scene: Scene;
  stage: string;
  message: string;
};

export function useAuroraController() {
  const authBypassEnabled =
    process.env.NODE_ENV === "test"
      ? process.env.NEXT_PUBLIC_AUTH_BYPASS_ENABLED === "true"
      : process.env.NEXT_PUBLIC_AUTH_BYPASS_ENABLED !== "false";
  const [mode, setMode] = useState<"mode_a" | "mode_b">("mode_b");
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [firstDeliverable, setFirstDeliverable] = useState("");
  const [styleKeywords, setStyleKeywords] = useState("");
  const [designDirectionNote, setDesignDirectionNote] = useState("");
  const [q0IntentConfidence, setQ0IntentConfidence] = useState<number | null>(null);
  const [autoContinue, setAutoContinue] = useState(true);
  const [autoPickTop1, setAutoPickTop1] = useState(true);
  const [onboardingPhase, setOnboardingPhase] = useState<OnboardingPhase>("setup");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionPayload, setSessionPayload] = useState<SessionPayload | null>(null);
  const [jobsPayload, setJobsPayload] = useState<JobsPayload | null>(null);
  const [runtimeGoalId, setRuntimeGoalId] = useState<string | null>(null);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<RuntimeGoalSnapshot | null>(null);
  const [sceneTransition, setSceneTransition] = useState<SceneTransitionState | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const [apiToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [showSignIn, setShowSignIn] = useState(false);

  const [queuedCommands, setQueuedCommands] = useState<QueuedCommand[]>([]);
  const [stageMessages, setStageMessages] = useState<ChatEntry[]>([]);

  const queuedRef = useRef<QueuedCommand[]>([]);
  const stageRef = useRef<string | null>(null);
  const flushingRef = useRef(false);
  const lastFailedActionRef = useRef<ActionFn | null>(null);
  const lastTimelineNoticeRef = useRef<string | null>(null);
  const announcedFailedJobRef = useRef<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    queuedRef.current = queuedCommands;
  }, [queuedCommands]);

  const requestJson = useCallback(
    async <T>(url: string, init?: RequestInitWithBody): Promise<T> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init?.headers ? (init.headers as Record<string, string>) : {})
      };

      try {
        const supabase = getSupabaseBrowserClient();
        let sessionResult = await supabase.auth.getSession();
        let accessToken = sessionResult.data.session?.access_token;
        if (!accessToken) {
          const signIn = await supabase.auth.signInAnonymously();
          if (signIn.error && !authBypassEnabled) {
            throw new ApiError("Unauthorized", 401, {
              error: signIn.error.message
            });
          }
          sessionResult = await supabase.auth.getSession();
          accessToken = sessionResult.data.session?.access_token;
        }
        if (!accessToken && !authBypassEnabled) {
          throw new ApiError("Unauthorized", 401, {
            error: "Unauthorized"
          });
        }
        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`;
        }
      } catch (tokenError) {
        if (!authBypassEnabled) {
          throw tokenError;
        }
      }

      const response = await fetch(url, {
        ...init,
        headers,
        cache: "no-store"
      });

      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json") ? await response.json() : await response.text();

      if (!response.ok) {
        const message =
          typeof body === "object" && body && "error" in body && typeof body.error === "string"
            ? body.error
            : `Request failed (${response.status})`;
        throw new ApiError(message, response.status, body);
      }

      return body as T;
    },
    [authBypassEnabled]
  );

  const handleActionError = useCallback((actionError: unknown, retryAction?: ActionFn) => {
    const message = normalizeActionErrorMessage(actionError, {
      currentStep: sessionPayload?.session.current_step
    });
    setError(message);
    if (actionError instanceof ApiError) {
      setErrorStatus(actionError.status);
      if (actionError.status === 401) {
        setShowSignIn(true);
      }
    } else {
      setErrorStatus(null);
    }

    if (retryAction) {
      lastFailedActionRef.current = retryAction;
      setCanRetry(true);
    }
    const dedupeKey = `error:${message}`;
    if (lastTimelineNoticeRef.current !== dedupeKey) {
      lastTimelineNoticeRef.current = dedupeKey;
      setStageMessages((current) => [
        ...current,
        {
          id: `stage_${crypto.randomUUID()}`,
          type: "system",
          content: message,
          createdAt: nowIso(),
          subtitle: actionError instanceof ApiError ? "request error" : "system error"
        }
      ]);
    }
  }, [sessionPayload?.session.current_step]);

  const runWithRecovery = useCallback(
    async (action: ActionFn, retryAction?: ActionFn): Promise<boolean> => {
      setBusy(true);
      setError(null);
      setErrorStatus(null);
      try {
        await action();
        if (retryAction) {
          lastFailedActionRef.current = null;
          setCanRetry(false);
        }
        return true;
      } catch (actionError) {
        handleActionError(actionError, retryAction);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [handleActionError]
  );

  const refreshSession = useCallback(
    async (targetSessionId: string) => {
      const [session, jobs] = await Promise.all([
        requestJson<SessionPayload>(`/api/sessions/${targetSessionId}`),
        requestJson<JobsPayload>(`/api/jobs?session_id=${targetSessionId}`)
      ]);
      setSessionPayload(session);
      setJobsPayload(jobs);
    },
    [requestJson]
  );

  const refreshRuntimeGoal = useCallback(
    async (goalId: string) => {
      const snapshot = await requestJson<RuntimeGoalSnapshot>(`/api/runtime/goals/${goalId}`);
      setRuntimeSnapshot(snapshot);
    },
    [requestJson]
  );

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const timer = setInterval(() => {
      refreshSession(sessionId).catch((refreshError) => {
        handleActionError(refreshError);
      });
    }, 2000);

    return () => clearInterval(timer);
  }, [handleActionError, refreshSession, sessionId]);

  useEffect(() => {
    if (!runtimeGoalId) {
      return;
    }

    const timer = setInterval(() => {
      refreshRuntimeGoal(runtimeGoalId).catch((runtimeError) => {
        handleActionError(runtimeError);
      });
    }, 2000);

    return () => clearInterval(timer);
  }, [handleActionError, refreshRuntimeGoal, runtimeGoalId]);

  const activeStepIndex = useMemo(() => {
    const currentStep = sessionPayload?.session.current_step;
    if (!currentStep) {
      return 0;
    }
    const index = AGENT_STEPS.findIndex((step) => step === currentStep);
    return index >= 0 ? index : 0;
  }, [sessionPayload?.session.current_step]);

  const currentScene = useMemo(() => {
    return resolveSceneFromStep(sessionPayload?.session.current_step);
  }, [sessionPayload?.session.current_step]);

  const hasActiveJob = useMemo(() => {
    return (jobsPayload?.jobs ?? []).some((job) => job.status === "pending" || job.status === "running");
  }, [jobsPayload?.jobs]);

  const latestFailedJob = useMemo(() => {
    return [...(jobsPayload?.jobs ?? [])]
      .filter((job) => job.status === "failed" && Boolean(job.error))
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0] ?? null;
  }, [jobsPayload?.jobs]);

  const shouldQueueIntervention = useMemo(() => {
    return sessionPayload?.session.status === "running" && hasActiveJob;
  }, [hasActiveJob, sessionPayload?.session.status]);

  const styleKeywordList = useMemo(() => {
    return styleKeywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);
  }, [styleKeywords]);

  const canStartSession = useMemo(() => {
    // TEMP: allow session start during testing even when setup is incomplete.
    return true;
  }, []);

  const appendTimelineMessage = useCallback(
    (input: {
      content: string;
      subtitle?: string;
      dedupeKey?: string;
    }) => {
      const content = input.content.trim();
      if (content.length === 0) {
        return;
      }

      const dedupeKey = input.dedupeKey ?? `${input.subtitle ?? "system"}:${content}`;
      if (lastTimelineNoticeRef.current === dedupeKey) {
        return;
      }

      lastTimelineNoticeRef.current = dedupeKey;
      setStageMessages((current) => [
        ...current,
        {
          id: `stage_${crypto.randomUUID()}`,
          type: "system",
          content,
          createdAt: nowIso(),
          subtitle: input.subtitle ?? "system note"
        }
      ]);
    },
    []
  );

  const appendQueuedCommand = useCallback((command: Omit<QueuedCommand, "id" | "createdAt">) => {
    setQueuedCommands((current) => [
      ...current,
      {
        id: `queue_${crypto.randomUUID()}`,
        createdAt: nowIso(),
        ...command
      }
    ]);
  }, []);

  const sendChatImmediate = useCallback(
    async (message: string): Promise<ChatApiResponse> => {
      return sendChatAndSync({
        sessionId,
        runtimeGoalId,
        message,
        requestJson,
        setRuntimeGoalId,
        refreshRuntimeGoal,
        refreshSession
      });
    },
    [refreshRuntimeGoal, refreshSession, requestJson, runtimeGoalId, sessionId]
  );

  const sendReviseImmediate = useCallback(
    async (constraint: string) => {
      if (!sessionId) {
        return;
      }
      const response = await requestJson<{
        runtime_meta?: {
          goal_id?: string;
        };
      }>("/api/revise", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          constraint,
          intensity: 60
        })
      });

      if (response.runtime_meta?.goal_id) {
        setRuntimeGoalId(response.runtime_meta.goal_id);
        await refreshRuntimeGoal(response.runtime_meta.goal_id);
      } else if (runtimeGoalId) {
        await refreshRuntimeGoal(runtimeGoalId);
      }
      await refreshSession(sessionId);
    },
    [refreshRuntimeGoal, refreshSession, requestJson, runtimeGoalId, sessionId]
  );

  const runForceReplan = useCallback(
    async () => {
      if (!runtimeGoalId) {
        return;
      }
      await requestJson("/api/runtime/step", {
        method: "POST",
        body: JSON.stringify({
          goal_id: runtimeGoalId,
          force_replan: true,
          idempotency_key: crypto.randomUUID()
        })
      });
      await refreshRuntimeGoal(runtimeGoalId);
      if (sessionId) {
        await refreshSession(sessionId);
      }
    },
    [refreshRuntimeGoal, refreshSession, requestJson, runtimeGoalId, sessionId]
  );

  const applyQueuedCommand = useCallback(
    async (command: QueuedCommand, withForceReplan: boolean) => {
      if (command.kind === "chat") {
        await sendChatImmediate(command.payload);
      } else {
        await sendReviseImmediate(command.payload);
      }

      if (withForceReplan) {
        await runForceReplan();
      }
    },
    [runForceReplan, sendChatImmediate, sendReviseImmediate]
  );

  const flushQueuedCommands = useCallback(async () => {
    if (flushingRef.current || queuedRef.current.length === 0) {
      return;
    }

    flushingRef.current = true;
    try {
      while (queuedRef.current.length > 0) {
        const nextCommand = queuedRef.current[0];
        const success = await runWithRecovery(
          async () => {
            await applyQueuedCommand(nextCommand, false);
            setQueuedCommands((current) => current.filter((item) => item.id !== nextCommand.id));
          },
          async () => {
            await applyQueuedCommand(nextCommand, true);
            setQueuedCommands((current) => current.filter((item) => item.id !== nextCommand.id));
          }
        );
        if (!success) {
          break;
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [applyQueuedCommand, runWithRecovery]);

  useEffect(() => {
    const currentStage = sessionPayload?.session.current_step ?? null;
    if (!currentStage) {
      stageRef.current = null;
      return;
    }

    const previousStage = stageRef.current;
    if (previousStage && previousStage !== currentStage) {
      const scene = resolveSceneFromStep(currentStage);
      const guide = buildStageGuideMessage(currentStage, sessionPayload);
      appendTimelineMessage({
        content: `${scene} scene으로 전환되었습니다 (${currentStage}).\n${guide}`,
        subtitle: "stage update",
        dedupeKey: `stage:${currentStage}`
      });
      void flushQueuedCommands();
    }

    stageRef.current = currentStage;
  }, [appendTimelineMessage, flushQueuedCommands, sessionPayload]);

  useEffect(() => {
    if (!latestFailedJob || !latestFailedJob.error) {
      return;
    }

    if (announcedFailedJobRef.current === latestFailedJob.id) {
      return;
    }

    announcedFailedJobRef.current = latestFailedJob.id;
    const guide = buildStageGuideMessage(latestFailedJob.step, sessionPayload);
    const summary = summarizeFailureForTimeline(latestFailedJob.step, latestFailedJob.error);
    appendTimelineMessage({
      content: `${guide}\n\n${summary}`,
      subtitle: "latest failure",
      dedupeKey: `failed-job:${latestFailedJob.id}`
    });
  }, [appendTimelineMessage, latestFailedJob, sessionPayload]);

  const handleStartSession = useCallback(async (): Promise<StartSessionResult> => {
    const run = async () => {
      const productForStart = product.trim() || "Untitled concept";
      const audienceForStart = audience.trim() || "General audience";
      const styleKeywordsForStart = styleKeywordList.length > 0 ? styleKeywordList : ["exploratory"];
      const designDirectionForStart =
        composeStructuredBriefConstraint({
          firstDeliverable,
          designRequirement: designDirectionNote
        }) || "Open direction. Explore broadly.";
      const q0ForStart = q0IntentConfidence ?? 3;

      const response = await requestJson<{
        session_id: string;
      }>("/api/session/start", {
        method: "POST",
        body: JSON.stringify({
          mode,
          product: productForStart,
          audience: audienceForStart,
          style_keywords: styleKeywordsForStart,
          design_direction_note: designDirectionForStart,
          q0_intent_confidence: q0ForStart,
          auto_continue: autoContinue,
          auto_pick_top1: autoPickTop1
        })
      });

      setRuntimeGoalId(null);
      setRuntimeSnapshot(null);
      setQueuedCommands([]);
      setStageMessages([]);
      lastTimelineNoticeRef.current = null;
      announcedFailedJobRef.current = null;
      stageRef.current = null;
      setSessionId(response.session_id);
      const bootstrap = await requestJson<{
        runtime_meta?: {
          goal_id?: string;
        };
      }>("/api/agent/run-step", {
        method: "POST",
        body: JSON.stringify({
          session_id: response.session_id,
          step: "interview_collect",
          payload: {
            bootstrap_until_direction: true
          },
          idempotency_key: crypto.randomUUID()
        })
      });
      if (bootstrap.runtime_meta?.goal_id) {
        setRuntimeGoalId(bootstrap.runtime_meta.goal_id);
        await refreshRuntimeGoal(bootstrap.runtime_meta.goal_id);
      }
      await refreshSession(response.session_id);
      setOnboardingPhase("flipping");
      await new Promise((resolve) => setTimeout(resolve, 380));
      setOnboardingPhase("workspace");
    };

    const success = await runWithRecovery(run, run);
    if (!success) {
      return { ok: false };
    }
    return {
      ok: true,
      message: "Session started."
    };
  }, [
    audience,
    firstDeliverable,
    autoContinue,
    autoPickTop1,
    designDirectionNote,
    mode,
    product,
    q0IntentConfidence,
    refreshRuntimeGoal,
    refreshSession,
    requestJson,
    runWithRecovery,
    styleKeywordList
  ]);

  const handleRunStep = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    const decision = resolveRunStepDecision(sessionPayload, hasActiveJob);
    if (decision.kind === "blocked") {
      appendTimelineMessage({
        content: decision.message,
        subtitle: decision.subtitle ?? "run blocked",
        dedupeKey: `run-blocked:${decision.message}`
      });
      setError(null);
      setErrorStatus(null);
      if (sessionId) {
        void refreshSession(sessionId).catch((refreshError) => {
          handleActionError(refreshError);
        });
      }
      return;
    }

    const run = async () => {
      const response = await requestJson<{
        runtime_meta?: {
          goal_id?: string;
        };
      }>("/api/agent/run-step", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          ...decision.body,
          idempotency_key: crypto.randomUUID()
        })
      });
      if (response.runtime_meta?.goal_id) {
        setRuntimeGoalId(response.runtime_meta.goal_id);
        await refreshRuntimeGoal(response.runtime_meta.goal_id);
      }
      await refreshSession(sessionId);
    };

    if (decision.body.step === "candidates_generate") {
      setSceneTransition({
        scene: "EXPLORE",
        stage: "candidates_generate",
        message: "Generating 3 concept bundles from the current direction."
      });
    } else if (decision.body.step === "approve_build") {
      setSceneTransition({
        scene: "PACKAGE",
        stage: "package",
        message: "Building final outputs and preparing the package."
      });
    } else {
      setSceneTransition(null);
    }

    await runWithRecovery(run, run);
    setSceneTransition(null);
  }, [
    appendTimelineMessage,
    handleActionError,
    hasActiveJob,
    refreshRuntimeGoal,
    refreshSession,
    requestJson,
    runWithRecovery,
    sessionId,
    sessionPayload
  ]);

  const handleSelectCandidate = useCallback(
    async (candidateId: string) => {
      if (!sessionId) {
        return;
      }

      const run = async () => {
        const response = await requestJson<{
          runtime_meta?: {
            goal_id?: string;
          };
        }>("/api/agent/run-step", {
          method: "POST",
          body: JSON.stringify({
            session_id: sessionId,
            action: "select_candidate",
            payload: {
              candidate_id: candidateId
            },
            idempotency_key: crypto.randomUUID()
          })
        });

        if (response.runtime_meta?.goal_id) {
          setRuntimeGoalId(response.runtime_meta.goal_id);
          await refreshRuntimeGoal(response.runtime_meta.goal_id);
        }
        await refreshSession(sessionId);
      };

      setSceneTransition({
        scene: "DECIDE",
        stage: "approve_build",
        message: "Locking the selected direction and preparing build approval."
      });
      await runWithRecovery(run, run);
      setSceneTransition(null);
    },
    [refreshRuntimeGoal, refreshSession, requestJson, runWithRecovery, sessionId]
  );

  const handleConfirmBuild = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    const run = async () => {
      const response = await requestJson<{
        runtime_meta?: {
          goal_id?: string;
        };
      }>("/api/agent/run-step", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          step: "approve_build",
          action: "proceed",
          idempotency_key: crypto.randomUUID()
        })
      });

      if (response.runtime_meta?.goal_id) {
        setRuntimeGoalId(response.runtime_meta.goal_id);
        await refreshRuntimeGoal(response.runtime_meta.goal_id);
      }
      await refreshSession(sessionId);
    };

    setSceneTransition({
      scene: "PACKAGE",
      stage: "package",
      message: "Building final outputs and preparing the package."
    });
    await runWithRecovery(run, run);
    setSceneTransition(null);
  }, [refreshRuntimeGoal, refreshSession, requestJson, runWithRecovery, sessionId]);

  const handleStartRuntimeGoal = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    const run = async () => {
      const response = await requestJson<{
        goal_id: string;
      }>("/api/runtime/start", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          goal_type: "deliver_demo_pack",
          idempotency_key: crypto.randomUUID()
        })
      });
      setRuntimeGoalId(response.goal_id);
      await refreshRuntimeGoal(response.goal_id);
      await refreshSession(sessionId);
    };

    await runWithRecovery(run, run);
  }, [refreshRuntimeGoal, refreshSession, requestJson, runWithRecovery, sessionId]);

  const handleRuntimeStep = useCallback(
    async (forceReplan = false) => {
      if (!runtimeGoalId) {
        return;
      }

      const run = async () => {
        await requestJson("/api/runtime/step", {
          method: "POST",
          body: JSON.stringify({
            goal_id: runtimeGoalId,
            force_replan: forceReplan,
            idempotency_key: crypto.randomUUID()
          })
        });
        await refreshRuntimeGoal(runtimeGoalId);
        if (sessionId) {
          await refreshSession(sessionId);
        }
      };

      await runWithRecovery(run, run);
    },
    [refreshRuntimeGoal, refreshSession, requestJson, runWithRecovery, runtimeGoalId, sessionId]
  );

  const handleRuntimeControl = useCallback(
    async (message: string): Promise<ChatApiResponse | null> => {
      if (!sessionId) {
        return null;
      }

      let response: ChatApiResponse | null = null;
      const run = async () => {
        response = await sendChatImmediate(message);
      };

      const success = await runWithRecovery(run, run);
      return success ? response : null;
    },
    [runWithRecovery, sendChatImmediate, sessionId]
  );

  const handleSendChat = useCallback(
    async (message: string): Promise<ChatApiResponse | null> => {
      const trimmed = message.trim();
      if (!sessionId || trimmed.length === 0) {
        return null;
      }

      if (shouldQueueIntervention) {
        appendQueuedCommand({
          kind: "chat",
          payload: trimmed,
          label: `Queued chat: ${trimmed}`
        });
        return null;
      }

      const pendingTransition = inferChatSceneTransition(trimmed);
      if (pendingTransition) {
        setSceneTransition(pendingTransition);
      }

      let response: ChatApiResponse | null = null;
      const run = async () => {
        response = await sendChatImmediate(trimmed);
      };

      const success = await runWithRecovery(run, run);
      if (pendingTransition) {
        setSceneTransition(null);
      }
      return success ? response : null;
    },
    [appendQueuedCommand, runWithRecovery, sendChatImmediate, sessionId, shouldQueueIntervention]
  );

  const handleSendRevise = useCallback(
    async (constraint: string) => {
      const trimmed = constraint.trim();
      if (!sessionId || trimmed.length === 0) {
        return;
      }

      if (shouldQueueIntervention) {
        appendQueuedCommand({
          kind: "revise",
          payload: trimmed,
          label: `Queued revise: ${trimmed}`
        });
        return;
      }

      const run = async () => {
        await sendReviseImmediate(trimmed);
      };

      await runWithRecovery(run, run);
    },
    [appendQueuedCommand, runWithRecovery, sendReviseImmediate, sessionId, shouldQueueIntervention]
  );

  const handleQuickAction = useCallback(
    async (actionId: QuickActionId) => {
      if (actionId === "pick_1") {
        await handleSendChat("pick 1");
        return;
      }
      if (actionId === "pick_2") {
        await handleSendChat("pick 2");
        return;
      }
      if (actionId === "pick_3") {
        await handleSendChat("pick 3");
        return;
      }
      if (actionId === "regenerate_top3") {
        await handleSendChat("rerun candidates");
        return;
      }
      if (actionId === "more_editorial") {
        await handleSendRevise("Make it more editorial while keeping current brand premise.");
        return;
      }
      if (actionId === "reduce_futuristic") {
        await handleSendRevise("Reduce futuristic accents and keep a calmer premium tone.");
        return;
      }
      if (actionId === "calmer") {
        await handleSendRevise("Make the direction calmer and quieter.");
        return;
      }
      if (actionId === "more_ritual") {
        await handleSendRevise("Increase ritual mood while preserving readability and restraint.");
        return;
      }
      if (actionId === "lock_style") {
        await handleSendRevise("Lock style: keep the current visual language and avoid large stylistic drift.");
      }
    },
    [handleSendChat, handleSendRevise]
  );

  const handleRegenerateTop3 = useCallback(async () => {
    await handleSendChat("rerun candidates");
  }, [handleSendChat]);

  const handleRegenerateOutputs = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    const run = async () => {
      const response = await requestJson<{
        runtime_meta?: {
          goal_id?: string;
        };
      }>("/api/agent/run-step", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          step: "approve_build",
          action: "proceed",
          idempotency_key: crypto.randomUUID()
        })
      });

      if (response.runtime_meta?.goal_id) {
        setRuntimeGoalId(response.runtime_meta.goal_id);
        await refreshRuntimeGoal(response.runtime_meta.goal_id);
      }
      await refreshSession(sessionId);
    };

    setSceneTransition({
      scene: "PACKAGE",
      stage: "package",
      message: "Refreshing package outputs."
    });
    await runWithRecovery(run, run);
    setSceneTransition(null);
  }, [refreshRuntimeGoal, refreshSession, requestJson, runWithRecovery, sessionId]);

  const handleUpdateDefineBrief = useCallback(
    async (input: {
      product: string;
      audience: string;
      firstDeliverable: string;
      styleKeywords: string[];
      constraint: string;
      q0IntentConfidence: number | null;
    }) => {
      if (!sessionId) {
        return;
      }

      const run = async () => {
        await requestJson(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            product: input.product.trim(),
            audience: input.audience.trim(),
            style_keywords: input.styleKeywords,
            constraint: composeStructuredBriefConstraint({
              firstDeliverable: input.firstDeliverable,
              designRequirement: input.constraint
            }),
            q0_intent_confidence: input.q0IntentConfidence ?? 3
          })
        });
        await refreshSession(sessionId);
      };

      await runWithRecovery(run, run);
    },
    [refreshSession, requestJson, runWithRecovery, sessionId]
  );

  const handleExportZip = useCallback(async () => {
    if (!sessionPayload || !sessionId) {
      return;
    }

    const run = async () => {
      const zip = new JSZip();
      const artifactByKind = new Map<string, ArtifactRecord>();
      for (const artifact of sessionPayload.recent_artifacts) {
        if (!artifactByKind.has(artifact.kind)) {
          artifactByKind.set(artifact.kind, artifact);
        }
      }

      const direction = sessionPayload.session.draft_spec?.direction ?? null;
      const brandNarrativeArtifact = artifactByKind.get("brand_narrative") ?? null;
      const candidatesArtifact = artifactByKind.get("candidates_top3") ?? null;
      const selectionArtifact = artifactByKind.get("selection") ?? null;
      const tokensArtifact = artifactByKind.get("tokens") ?? null;
      const socialAssetsArtifact = artifactByKind.get("social_assets") ?? null;
      const codePlanArtifact = artifactByKind.get("code_plan") ?? null;
      const packMetaArtifact = artifactByKind.get("pack_meta") ?? null;
      const selectedCandidate =
        (sessionPayload.latest_top3 ?? []).find((candidate) => candidate.id === sessionPayload.selected_candidate_id) ?? null;
      const selectedPromptManifest = selectedCandidate
        ? {
            hero: {
              prompt: selectedCandidate.image_prompt,
              image_url: selectedCandidate.image_url
            },
            supporting_assets: (selectedCandidate.supporting_assets ?? []).map((asset) => ({
              id: asset.id,
              kind: asset.kind,
              title: asset.title,
              prompt: asset.prompt,
              image_url: asset.image_url
            }))
          }
        : null;
      const followupManifest = sessionPayload.recent_artifacts
        .filter((artifact) => artifact.kind === "followup_asset")
        .map((artifact) => ({
          title: artifact.title,
          prompt: artifact.content?.prompt ?? null,
          image_url: artifact.content?.image_url ?? null,
          candidate_id: artifact.content?.candidate_id ?? null,
          revision_basis: artifact.content?.revision_basis ?? null,
          created_at: artifact.created_at
        }));

      zip.file(
        "brief.json",
        JSON.stringify(
          {
            product: sessionPayload.session.product,
            audience: sessionPayload.session.audience,
            first_deliverable: parseStructuredBriefConstraint(sessionPayload.session.constraint).firstDeliverable,
            style_keywords: sessionPayload.session.style_keywords,
            design_requirement: parseStructuredBriefConstraint(sessionPayload.session.constraint).designRequirement,
            q0_intent_confidence: sessionPayload.session.intent_confidence,
            variation_width: sessionPayload.session.variation_width
          },
          null,
          2
        )
      );
      zip.file("direction.json", JSON.stringify(direction, null, 2));
      zip.file("brand_narrative.json", JSON.stringify(brandNarrativeArtifact?.content ?? null, null, 2));
      zip.file("candidates_top3.json", JSON.stringify(candidatesArtifact?.content ?? { candidates: sessionPayload.latest_top3 }, null, 2));
      zip.file(
        "selection.json",
        JSON.stringify(
          selectionArtifact?.content ?? {
            selected_candidate_id: sessionPayload.selected_candidate_id,
            selected_candidate: selectedCandidate
          },
          null,
          2
        )
      );
      zip.file("selected_candidate_summary.json", JSON.stringify(selectedCandidate, null, 2));
      zip.file(
        "selected_prompt_manifest.json",
        JSON.stringify(
          {
            selected_candidate: selectedPromptManifest,
            revisions: followupManifest
          },
          null,
          2
        )
      );
      zip.file("final_spec.json", JSON.stringify(sessionPayload.session.final_spec ?? null, null, 2));
      zip.file("tokens.json", JSON.stringify(tokensArtifact?.content ?? null, null, 2));
      zip.file("social_assets.json", JSON.stringify(socialAssetsArtifact?.content ?? null, null, 2));
      zip.file("code_plan.json", JSON.stringify(codePlanArtifact?.content ?? null, null, 2));
      zip.file("pack_meta.json", JSON.stringify(packMetaArtifact?.content ?? null, null, 2));
      zip.file("meta/runtime_goal.json", JSON.stringify(runtimeSnapshot?.goal ?? null, null, 2));
      zip.file(
        "meta/session.json",
        JSON.stringify(
          {
            id: sessionPayload.session.id,
            current_step: sessionPayload.session.current_step,
            status: sessionPayload.session.status,
            selected_candidate_id: sessionPayload.selected_candidate_id
          },
          null,
          2
        )
      );

      const blob = await zip.generateAsync({ type: "blob" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `aurora-pack-${sessionId}.zip`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    };

    await runWithRecovery(run, run);
  }, [runWithRecovery, runtimeSnapshot?.goal, sessionId, sessionPayload]);

  const executeSlashCommand = useCallback(
    async (raw: string): Promise<CommandExecutionResult> => {
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        return {
          accepted: false,
          kind: "chat",
          message: "명령을 입력하세요."
        };
      }

      if (!trimmed.startsWith("/")) {
        if (!sessionId) {
          const message = "Session is required. Run /start first.";
          setError(message);
          setErrorStatus(null);
          appendTimelineMessage({
            content: message,
            subtitle: "chat blocked",
            dedupeKey: `chat-blocked:${message}`
          });
          return {
            accepted: false,
            kind: "chat",
            message
          };
        }
        const structuredChatCommandId = resolveStructuredChatCommandId(trimmed);
        const response = await handleSendChat(trimmed);
        return {
          accepted: true,
          kind: "chat",
          message: structuredChatCommandId
            ? buildPostCommandGuide(structuredChatCommandId, sessionPayload?.session.current_step)
            : buildPostChatGuide(sessionPayload?.session.current_step, trimmed),
          ...getCommandExecutionMeta(response)
        };
      }

      if (trimmed.startsWith("/setup")) {
        if (sessionId) {
          return {
            accepted: false,
            kind: "slash",
            commandId: "setup_brief",
            message: "Setup commands are only available before /start. After session start, use chat or the action buttons."
          };
        }

        const parsedSetup = parseSetupCommand(trimmed);
        if (!parsedSetup) {
          const message = [
            "Setup command format:",
            "/setup product <text>",
            "/setup audience <text>",
            "/setup deliverable <text>",
            "/setup style <comma-separated keywords>",
            "/setup q0 <1-5>",
            "/setup note <design direction note>"
          ].join("\n");
          return {
            accepted: false,
            kind: "slash",
            commandId: "setup_brief",
            message
          };
        }

        if (parsedSetup.field === "product") {
          setProduct(parsedSetup.value);
          setError(null);
          setErrorStatus(null);
          return {
            accepted: true,
            kind: "slash",
            commandId: "setup_brief",
            message: `Setup updated: product = ${parsedSetup.value}\nNext: continue filling the brief or click Start Session when ready.`
          };
        }

        if (parsedSetup.field === "audience") {
          setAudience(parsedSetup.value);
          setError(null);
          setErrorStatus(null);
          return {
            accepted: true,
            kind: "slash",
            commandId: "setup_brief",
            message: `Setup updated: audience = ${parsedSetup.value}\nNext: continue filling the brief or click Start Session when ready.`
          };
        }

        if (parsedSetup.field === "deliverable") {
          setFirstDeliverable(parsedSetup.value);
          setError(null);
          setErrorStatus(null);
          return {
            accepted: true,
            kind: "slash",
            commandId: "setup_brief",
            message: `Setup updated: first deliverable = ${parsedSetup.value}\nNext: continue filling the brief or click Start Session when ready.`
          };
        }

        if (parsedSetup.field === "style") {
          setStyleKeywords(parsedSetup.value);
          setError(null);
          setErrorStatus(null);
          return {
            accepted: true,
            kind: "slash",
            commandId: "setup_brief",
            message: `Setup updated: style keywords = ${parsedSetup.value}\nNext: continue filling the brief or click Start Session when ready.`
          };
        }

        if (parsedSetup.field === "note") {
          const noteValue = parsedSetup.value.trim();
          if (noteValue.length < 3) {
            return {
              accepted: false,
              kind: "slash",
              commandId: "setup_brief",
              message: "Design requirement note must be at least 3 characters."
            };
          }
          setDesignDirectionNote(noteValue);
          setError(null);
          setErrorStatus(null);
          return {
            accepted: true,
            kind: "slash",
            commandId: "setup_brief",
            message: "Setup updated: design direction note saved.\nNext: continue filling the brief or click Start Session when ready."
          };
        }

        const q0Score = Number(parsedSetup.value);
        if (!Number.isInteger(q0Score) || q0Score < 1 || q0Score > 5) {
          return {
            accepted: false,
            kind: "slash",
            commandId: "setup_brief",
            message: "Q0 must be an integer from 1 to 5. Example: /setup q0 4"
          };
        }

        setQ0IntentConfidence(q0Score);
        setError(null);
        setErrorStatus(null);
        return {
          accepted: true,
          kind: "slash",
          commandId: "setup_brief",
          message: `Setup updated: q0 = ${q0Score}\nNext: continue filling the brief or click Start Session when ready.`
        };
      }

      const parsed = parseSlashCommand(trimmed);
      if (!parsed) {
        const message = "Unknown slash command. Try /help.";
        setError(message);
        setErrorStatus(null);
        appendTimelineMessage({
          content: message,
          subtitle: "command blocked",
          dedupeKey: `command-blocked:${message}`
        });
        return {
          accepted: false,
          kind: "slash",
          message
        };
      }

      const contextMessage = validateSlashCommandContext(parsed.spec, {
        sessionReady: Boolean(sessionId),
        runtimeGoalReady: Boolean(runtimeGoalId)
      });
      if (contextMessage) {
        setError(contextMessage);
        setErrorStatus(null);
        appendTimelineMessage({
          content: contextMessage,
          subtitle: "command blocked",
          dedupeKey: `command-blocked:${parsed.id}:${contextMessage}`
        });
        return {
          accepted: false,
          kind: "slash",
          commandId: parsed.id,
          message: contextMessage
        };
      }

      if (shouldQueueIntervention && !parsed.spec.queueable) {
        const message = "This command can not be queued. Wait for current stage to finish.";
        setError(message);
        setErrorStatus(null);
        appendTimelineMessage({
          content: message,
          subtitle: "command blocked",
          dedupeKey: `command-blocked:${parsed.id}:${message}`
        });
        return {
          accepted: false,
          kind: "slash",
          commandId: parsed.id,
          message
        };
      }

      if (parsed.id === "help") {
        return {
          accepted: true,
          kind: "slash",
          commandId: "help",
          message: buildSlashHelpText({ sessionReady: Boolean(sessionId) })
        };
      }

      if (parsed.id === "start_session") {
        const startResult = await handleStartSession();
        if (!startResult.ok) {
          const checklist = startResult.message ?? "Start failed.";
          setStageMessages((current) => [
            ...current,
            {
              id: `setup_${crypto.randomUUID()}`,
              type: "system",
              content: checklist,
              createdAt: nowIso(),
              subtitle: "setup required"
            }
          ]);
          return {
            accepted: false,
            kind: "slash",
            commandId: "start_session"
          };
        }
        return {
          accepted: true,
          kind: "slash",
          commandId: "start_session",
          message: startResult.message
        };
      } else if (parsed.id === "run_step") {
        await handleRunStep();
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          message: buildPostCommandGuide(parsed.id, sessionPayload?.session.current_step)
        };
      } else if (parsed.id === "confirm_build") {
        await handleConfirmBuild();
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          message: buildPostCommandGuide(parsed.id, sessionPayload?.session.current_step)
        };
      } else if (parsed.id === "pick_1" || parsed.id === "pick_2" || parsed.id === "pick_3") {
        const pickCommand = parsed.id === "pick_1" ? "pick 1" : parsed.id === "pick_2" ? "pick 2" : "pick 3";
        const response = await handleSendChat(pickCommand);
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          message: buildPostCommandGuide(parsed.id, sessionPayload?.session.current_step),
          ...getCommandExecutionMeta(response)
        };
      } else if (parsed.id === "regenerate_top3") {
        const response = await handleSendChat("rerun candidates");
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          message: buildPostCommandGuide(parsed.id, sessionPayload?.session.current_step),
          ...getCommandExecutionMeta(response)
        };
      } else if (parsed.id === "regenerate_outputs") {
        await handleRegenerateOutputs();
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          message: buildPostCommandGuide(parsed.id, sessionPayload?.session.current_step)
        };
      } else if (parsed.id === "export_zip") {
        await handleExportZip();
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          message: buildPostCommandGuide(parsed.id, sessionPayload?.session.current_step)
        };
      } else if (parsed.id === "tone_editorial") {
        await handleSendRevise("Make it more editorial while keeping current brand premise.");
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          message: buildPostChatGuide(sessionPayload?.session.current_step, "make it more editorial while keeping current brand premise")
        };
      } else if (parsed.id === "tone_less_futuristic") {
        await handleSendRevise("Reduce futuristic accents and keep a calmer premium tone.");
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          message: buildPostChatGuide(sessionPayload?.session.current_step, "reduce futuristic accents and keep a calmer premium tone")
        };
      } else if (parsed.id === "tone_calmer") {
        await handleSendRevise("Make the direction calmer and quieter.");
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          message: buildPostChatGuide(sessionPayload?.session.current_step, "make the direction calmer and quieter")
        };
      } else if (parsed.id === "tone_ritual") {
        await handleSendRevise("Increase ritual mood while preserving readability and restraint.");
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          message: buildPostChatGuide(sessionPayload?.session.current_step, "increase ritual mood while preserving readability and restraint")
        };
      } else if (parsed.id === "start_runtime_goal") {
        await handleStartRuntimeGoal();
      } else if (parsed.id === "runtime_step") {
        await handleRuntimeStep(false);
      } else if (parsed.id === "pause_runtime") {
        const response = await handleRuntimeControl("pause");
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          ...getCommandExecutionMeta(response)
        };
      } else if (parsed.id === "resume_runtime") {
        const response = await handleRuntimeControl("resume");
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          ...getCommandExecutionMeta(response)
        };
      } else if (parsed.id === "force_replan") {
        await handleRuntimeStep(true);
      }

      return {
        accepted: true,
        kind: "slash",
        commandId: parsed.id,
        message: buildPostCommandGuide(parsed.id, sessionPayload?.session.current_step)
      };
    },
    [
      appendTimelineMessage,
      handleConfirmBuild,
      handleExportZip,
      handleRegenerateOutputs,
      handleRunStep,
      handleRuntimeControl,
      handleRuntimeStep,
      handleSendChat,
      handleSendRevise,
      handleStartRuntimeGoal,
      handleStartSession,
      runtimeGoalId,
      sessionId,
      shouldQueueIntervention
    ]
  );

  const handleRunGuidedAction = useCallback(
    async (actionId: GuidedActionId) => {
      if (actionId === "start_session") {
        await handleStartSession();
        return;
      }
      if (actionId === "run_step") {
        await handleRunStep();
        return;
      }
      if (actionId === "confirm_build") {
        await handleConfirmBuild();
        return;
      }
      if (actionId === "regenerate_top3") {
        await handleRegenerateTop3();
        return;
      }
      if (actionId === "regenerate_outputs") {
        await handleRegenerateOutputs();
        return;
      }
      if (actionId === "export_zip") {
        await handleExportZip();
        return;
      }
      if (actionId === "start_runtime_goal") {
        await handleStartRuntimeGoal();
        return;
      }
      if (actionId === "runtime_step") {
        await handleRuntimeStep(false);
        return;
      }
      if (actionId === "pause_runtime") {
        await handleRuntimeControl("pause");
        return;
      }
      if (actionId === "resume_runtime") {
        await handleRuntimeControl("resume");
        return;
      }
      if (actionId === "force_replan") {
        await handleRuntimeStep(true);
        return;
      }
      if (actionId === "pick_1" || actionId === "pick_2" || actionId === "pick_3") {
        await handleQuickAction(actionId);
      }
    },
    [
      handleConfirmBuild,
      handleExportZip,
      handleQuickAction,
      handleRegenerateOutputs,
      handleRegenerateTop3,
      handleRunStep,
      handleStartRuntimeGoal,
      handleRuntimeControl,
      handleRuntimeStep,
      handleStartSession
    ]
  );

  const handleForceQueued = useCallback(
    async (queueId: string) => {
      const command = queuedRef.current.find((item) => item.id === queueId);
      if (!command) {
        return;
      }

      const run = async () => {
        await applyQueuedCommand(command, true);
        setQueuedCommands((current) => current.filter((item) => item.id !== queueId));
      };

      await runWithRecovery(run, run);
    },
    [applyQueuedCommand, runWithRecovery]
  );

  const handleDiscardQueued = useCallback((queueId: string) => {
    setQueuedCommands((current) => current.filter((item) => item.id !== queueId));
  }, []);

  const handleRetryLastAction = useCallback(async () => {
    const retryAction = lastFailedActionRef.current;
    if (!retryAction) {
      return;
    }
    await runWithRecovery(retryAction, retryAction);
  }, [runWithRecovery]);

  const handleSaveApiToken = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signInAnonymously();
    setShowSignIn(false);
    setError(null);
    setErrorStatus(null);
  }, []);

  const handleClearApiToken = useCallback(() => {
    setTokenDraft("");
    void getSupabaseBrowserClient().auth.signOut();
  }, []);

  const chatEntries = useMemo<ChatEntry[]>(() => {
    const messageEntries = (sessionPayload?.recent_messages ?? []).map((message) => ({
      id: message.id,
      type: message.role,
      content: summarizeMessageForTimeline({
        role: message.role,
        content: message.content
      }),
      createdAt: message.created_at,
      imageUrl: typeof message.metadata?.image_url === "string" ? message.metadata.image_url : undefined
    }));

    const artifactEntries = (sessionPayload?.recent_artifacts ?? []).map((artifact: ArtifactRecord) => {
      const artifactImageUrl = typeof artifact.content?.image_url === "string" ? artifact.content.image_url : undefined;
      const timelineSummary = summarizeArtifactForTimeline(artifact);
      return {
        id: `artifact_${artifact.id}`,
        type: "artifact-note" as const,
        content: timelineSummary.content,
        subtitle: timelineSummary.subtitle,
        createdAt: artifact.created_at,
        imageUrl: artifactImageUrl
      };
    });

    const merged = [...messageEntries, ...stageMessages, ...artifactEntries];
    merged.sort((left, right) => {
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });
    return merged;
  }, [sessionPayload?.recent_artifacts, sessionPayload?.recent_messages, stageMessages]);

  const buildConfirmRequired =
    Boolean(sessionPayload?.selected_candidate_id) && sessionPayload?.session.current_step === "approve_build";

  const top3ModelSource = useMemo<ModelSource>(() => {
    const top3Artifact = (sessionPayload?.recent_artifacts ?? [])
      .filter((artifact) => artifact.kind === "candidates_top3")
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0];
    const source = top3Artifact?.content?.source;
    if (source === "openai") {
      return "OPENAI";
    }
    if (source === "mock") {
      return "MOCK";
    }
    return "UNKNOWN";
  }, [sessionPayload?.recent_artifacts]);

  const packReady = useMemo(() => {
    if (!sessionPayload) {
      return false;
    }
    return (
      sessionPayload.session.current_step === "done" ||
      sessionPayload.recent_artifacts.some((artifact) => artifact.kind === "pack_meta")
    );
  }, [sessionPayload]);

  const defineDirectionClarity = useMemo(() => getDirectionClarityFromPayload(sessionPayload), [sessionPayload]);
  const defineReadyForConcepts = defineDirectionClarity?.ready_for_concepts !== false;
  const defineFollowupQuestion = defineDirectionClarity?.followup_questions?.[0] ?? null;
  const uiScene = sceneTransition?.scene ?? currentScene;
  const uiStep = sceneTransition?.stage ?? sessionPayload?.session.current_step ?? "interview_collect";

  const rightPanelViewModel = useMemo<RightPanelViewModel>(() => {
    const resolved = resolveGuidedActionViewModel({
      sessionId,
      status: sessionPayload?.session.status ?? "idle",
      currentScene: uiScene,
      currentStep: uiStep,
      top3Count: sessionPayload?.latest_top3?.length ?? 0,
      selectedCandidateId: sessionPayload?.selected_candidate_id ?? null,
      buildConfirmRequired,
      runtimeGoalId,
      packReady,
      shouldQueueIntervention,
      canStartSession,
      defineReadyForConcepts,
      defineFollowupQuestion
    });
    return {
      ...resolved,
      modelSource: top3ModelSource
    };
  }, [
    buildConfirmRequired,
    canStartSession,
    defineFollowupQuestion,
    defineReadyForConcepts,
    packReady,
    runtimeGoalId,
    sessionId,
    sessionPayload?.latest_top3?.length,
    sessionPayload?.selected_candidate_id,
    sessionPayload?.session.current_step,
    sessionPayload?.session.status,
    sceneTransition?.scene,
    sceneTransition?.stage,
    shouldQueueIntervention,
    top3ModelSource
  ]);

  return {
    mode,
    setMode,
    product,
    setProduct,
    audience,
    setAudience,
    firstDeliverable,
    setFirstDeliverable,
    styleKeywords,
    setStyleKeywords,
    designDirectionNote,
    setDesignDirectionNote,
    q0IntentConfidence,
    setQ0IntentConfidence,
    onboardingPhase,
    autoContinue,
    setAutoContinue,
    autoPickTop1,
    setAutoPickTop1,
    canStartSession,
    sessionId,
    sessionPayload,
    jobsPayload,
    runtimeGoalId,
    runtimeSnapshot,
    busy,
    error,
    errorStatus,
    canRetry,
    showSignIn,
    setShowSignIn,
    tokenDraft,
    setTokenDraft,
    apiToken,
    currentScene,
    activeStepIndex,
    hasActiveJob,
    latestFailedJob,
    shouldQueueIntervention,
    queuedCommands,
    chatEntries,
    sceneTransition,
    buildConfirmRequired,
    top3ModelSource,
    rightPanelViewModel,
    handleStartSession,
    handleRunStep,
    handleSelectCandidate,
    handleConfirmBuild,
    handleSendChat,
    executeSlashCommand,
    handleSendRevise,
    handleQuickAction,
    handleRunGuidedAction,
    handleRegenerateTop3,
    handleRegenerateOutputs,
    handleUpdateDefineBrief,
    handleExportZip,
    handleStartRuntimeGoal,
    handleRuntimeStep,
    handleRuntimeControl,
    handleForceQueued,
    handleDiscardQueued,
    handleRetryLastAction,
    handleSaveApiToken,
    handleClearApiToken
  };
}
