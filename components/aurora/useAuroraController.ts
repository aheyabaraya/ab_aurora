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
  type SessionPayload,
  resolveSceneFromStep
} from "./types";
import { ASSET_BASE } from "./aurora-assets";
import { resolveGuidedActionViewModel } from "./guided-actions";
import {
  buildSlashHelpText,
  parseSlashCommand,
  validateSlashCommandContext
} from "./slash-commands";

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
      "추천: /run 으로 재시도하세요.",
      "상세 오류는 좌측 Setup/Runtime의 Latest failure details에서 확인할 수 있습니다."
    ].join("\n");
  }

  if (input.role !== "user" && raw.length > 640) {
    return `${raw.slice(0, 640)}...`;
  }
  return raw;
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

function buildStageGuideMessage(stage: string, payload: SessionPayload | null): string {
  const status = payload?.session.status;
  if (status === "failed" && stage === "candidates_generate") {
    return "EXPLORE 후보 생성이 실패했습니다. /run 으로 재시도하고, 상세 오류는 좌측 Latest failure details에서 확인하세요.";
  }

  if (stage === "top3_select") {
    const candidates = (payload?.latest_top3 ?? []).slice(0, 3);
    const optionLines = candidates.map((candidate, index) => {
      return `- /pick ${index + 1}: ${candidate.naming.recommended} (${candidate.rationale.slice(0, 52)})`;
    });
    optionLines.push("- /regen top3: 후보 3개를 다시 생성");
    return `DECIDE 선택 단계입니다.\n${optionLines.join("\n")}`;
  }

  if (stage === "approve_build") {
    if (payload?.session.auto_pick_top1 === false) {
      return "Build 확인 단계입니다. /build 로 확정하거나 /regen top3 로 후보를 다시 생성할 수 있습니다.";
    }
    return "Build 승인 처리 단계입니다. 필요 시 /run 으로 다음 진행을 트리거하세요.";
  }

  if (stage === "package" || stage === "done") {
    return "PACKAGE 단계입니다. /export 로 내보내거나 /regen outputs 로 산출물만 재생성할 수 있습니다.";
  }

  if (stage === "candidates_generate") {
    return "EXPLORE 단계입니다. Top-3 생성 대기 중이며 /run 으로 다음 실행을 진행할 수 있습니다.";
  }

  if (stage === "brand_narrative") {
    return "DEFINE 단계입니다. 브랜드 내러티브를 구성한 뒤 후보 생성 단계로 진행합니다.";
  }

  return "다음 단계 진행은 /run, 스타일 수정은 /tone calmer 또는 /tone editorial 을 사용하세요.";
}

type ActionFn = () => Promise<void>;
type OnboardingPhase = "setup" | "flipping" | "workspace";

export function useAuroraController() {
  const [mode, setMode] = useState<"mode_a" | "mode_b">("mode_b");
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [styleKeywords, setStyleKeywords] = useState("");
  const [q0IntentConfidence, setQ0IntentConfidence] = useState<number | null>(null);
  const [autoContinue, setAutoContinue] = useState(true);
  const [autoPickTop1, setAutoPickTop1] = useState(true);
  const [onboardingPhase, setOnboardingPhase] = useState<OnboardingPhase>("setup");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionPayload, setSessionPayload] = useState<SessionPayload | null>(null);
  const [jobsPayload, setJobsPayload] = useState<JobsPayload | null>(null);
  const [runtimeGoalId, setRuntimeGoalId] = useState<string | null>(null);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<RuntimeGoalSnapshot | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const [apiToken, setApiToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [showSignIn, setShowSignIn] = useState(false);

  const [queuedCommands, setQueuedCommands] = useState<QueuedCommand[]>([]);
  const [stageMessages, setStageMessages] = useState<ChatEntry[]>([]);

  const queuedRef = useRef<QueuedCommand[]>([]);
  const stageRef = useRef<string | null>(null);
  const flushingRef = useRef(false);
  const lastFailedActionRef = useRef<ActionFn | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    queuedRef.current = queuedCommands;
  }, [queuedCommands]);

  useEffect(() => {
    const storedToken = window.sessionStorage.getItem("ab_aurora_api_token") ?? "";
    if (storedToken) {
      setApiToken(storedToken);
      setTokenDraft(storedToken);
    }
  }, []);

  const requestJson = useCallback(
    async <T>(url: string, init?: RequestInitWithBody): Promise<T> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init?.headers ? (init.headers as Record<string, string>) : {})
      };
      if (apiToken.trim().length > 0) {
        headers["x-api-token"] = apiToken.trim();
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
    [apiToken]
  );

  const handleActionError = useCallback((actionError: unknown, retryAction?: ActionFn) => {
    const message = toErrorMessage(actionError);
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
  }, []);

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
    return (
      product.trim().length >= 3 &&
      audience.trim().length >= 3 &&
      styleKeywordList.length >= 1 &&
      q0IntentConfidence !== null
    );
  }, [audience, product, q0IntentConfidence, styleKeywordList.length]);

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
      setStageMessages((current) => [
        ...current,
        {
          id: `stage_${crypto.randomUUID()}`,
          type: "system",
          content: `${scene} scene으로 전환되었습니다 (${currentStage}).\n${guide}`,
          createdAt: nowIso(),
          subtitle: "stage update"
        }
      ]);
      void flushQueuedCommands();
    }

    stageRef.current = currentStage;
  }, [flushQueuedCommands, sessionPayload]);

  const handleStartSession = useCallback(async () => {
    if (!canStartSession) {
      setError("Product, Audience, Style keywords와 Q0(1-5)를 먼저 입력하세요.");
      return;
    }

    const run = async () => {
      const response = await requestJson<{
        session_id: string;
      }>("/api/session/start", {
        method: "POST",
        body: JSON.stringify({
          mode,
          product,
          audience,
          style_keywords: styleKeywordList,
          q0_intent_confidence: q0IntentConfidence,
          auto_continue: autoContinue,
          auto_pick_top1: autoPickTop1
        })
      });

      setRuntimeGoalId(null);
      setRuntimeSnapshot(null);
      setQueuedCommands([]);
      setStageMessages([]);
      stageRef.current = null;
      await refreshSession(response.session_id);
      setOnboardingPhase("flipping");
      await new Promise((resolve) => setTimeout(resolve, 380));
      setSessionId(response.session_id);
      setOnboardingPhase("workspace");
    };

    await runWithRecovery(run, run);
  }, [
    audience,
    autoContinue,
    autoPickTop1,
    canStartSession,
    mode,
    product,
    q0IntentConfidence,
    refreshSession,
    requestJson,
    runWithRecovery,
    styleKeywordList
  ]);

  const handleRunStep = useCallback(async () => {
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
          idempotency_key: crypto.randomUUID()
        })
      });
      if (response.runtime_meta?.goal_id) {
        setRuntimeGoalId(response.runtime_meta.goal_id);
        await refreshRuntimeGoal(response.runtime_meta.goal_id);
      }
      await refreshSession(sessionId);
    };

    await runWithRecovery(run, run);
  }, [refreshRuntimeGoal, refreshSession, requestJson, runWithRecovery, sessionId]);

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

      await runWithRecovery(run, run);
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

    await runWithRecovery(run, run);
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

      let response: ChatApiResponse | null = null;
      const run = async () => {
        response = await sendChatImmediate(trimmed);
      };

      const success = await runWithRecovery(run, run);
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

    await runWithRecovery(run, run);
  }, [refreshRuntimeGoal, refreshSession, requestJson, runWithRecovery, sessionId]);

  const handleExportZip = useCallback(async () => {
    if (!sessionPayload || !sessionId) {
      return;
    }

    const run = async () => {
      const zip = new JSZip();
      zip.file("meta/session.json", JSON.stringify(sessionPayload.session, null, 2));
      zip.file("meta/runtime_goal.json", JSON.stringify(runtimeSnapshot?.goal ?? null, null, 2));
      zip.file("artifacts/recent_artifacts.json", JSON.stringify(sessionPayload.recent_artifacts, null, 2));
      zip.file("chat/recent_messages.json", JSON.stringify(sessionPayload.recent_messages, null, 2));
      zip.file(
        "assets/reference_urls.json",
        JSON.stringify(
          {
            card_1: `${ASSET_BASE}/top3_01_hyunmu_card_768x1024.webp`,
            card_2: `${ASSET_BASE}/top3_02_samjoko_card_768x1024.webp`,
            card_3: `${ASSET_BASE}/top3_03_haetae_card_768x1024.webp`,
            background_desktop: `${ASSET_BASE}/bg_abstract_orbline_1920x1080.webp`,
            background_mobile: `${ASSET_BASE}/bg_abstract_orbline_1080x1920.webp`,
            sigil_overlay: `${ASSET_BASE}/sigil_tile_1024.png`
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
          return {
            accepted: false,
            kind: "chat",
            message
          };
        }
        const response = await handleSendChat(trimmed);
        return {
          accepted: true,
          kind: "chat",
          ...getCommandExecutionMeta(response)
        };
      }

      const parsed = parseSlashCommand(trimmed);
      if (!parsed) {
        const message = "Unknown slash command. Try /help.";
        setError(message);
        setErrorStatus(null);
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
          message: buildSlashHelpText()
        };
      }

      if (parsed.id === "start_session") {
        await handleStartSession();
      } else if (parsed.id === "run_step") {
        await handleRunStep();
      } else if (parsed.id === "confirm_build") {
        await handleConfirmBuild();
      } else if (parsed.id === "pick_1" || parsed.id === "pick_2" || parsed.id === "pick_3") {
        const pickCommand = parsed.id === "pick_1" ? "pick 1" : parsed.id === "pick_2" ? "pick 2" : "pick 3";
        const response = await handleSendChat(pickCommand);
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          ...getCommandExecutionMeta(response)
        };
      } else if (parsed.id === "regenerate_top3") {
        const response = await handleSendChat("rerun candidates");
        return {
          accepted: true,
          kind: "slash",
          commandId: parsed.id,
          ...getCommandExecutionMeta(response)
        };
      } else if (parsed.id === "regenerate_outputs") {
        await handleRegenerateOutputs();
      } else if (parsed.id === "export_zip") {
        await handleExportZip();
      } else if (parsed.id === "tone_editorial") {
        await handleSendRevise("Make it more editorial while keeping current brand premise.");
      } else if (parsed.id === "tone_less_futuristic") {
        await handleSendRevise("Reduce futuristic accents and keep a calmer premium tone.");
      } else if (parsed.id === "tone_calmer") {
        await handleSendRevise("Make the direction calmer and quieter.");
      } else if (parsed.id === "tone_ritual") {
        await handleSendRevise("Increase ritual mood while preserving readability and restraint.");
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
        commandId: parsed.id
      };
    },
    [
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

  const handleSaveApiToken = useCallback(() => {
    const normalized = tokenDraft.trim();
    setApiToken(normalized);
    window.sessionStorage.setItem("ab_aurora_api_token", normalized);
    setShowSignIn(false);
    setError(null);
    setErrorStatus(null);
  }, [tokenDraft]);

  const handleClearApiToken = useCallback(() => {
    setApiToken("");
    setTokenDraft("");
    window.sessionStorage.removeItem("ab_aurora_api_token");
  }, []);

  const chatEntries = useMemo<ChatEntry[]>(() => {
    const messageEntries = (sessionPayload?.recent_messages ?? []).map((message) => ({
      id: message.id,
      type: message.role,
      content: summarizeMessageForTimeline({
        role: message.role,
        content: message.content
      }),
      createdAt: message.created_at
    }));

    const artifactEntries = (sessionPayload?.recent_artifacts ?? []).map((artifact: ArtifactRecord) => ({
      id: `artifact_${artifact.id}`,
      type: "artifact-note" as const,
      content: artifact.title,
      subtitle: artifact.kind,
      createdAt: artifact.created_at
    }));

    const merged = [...messageEntries, ...stageMessages, ...artifactEntries];
    merged.sort((left, right) => {
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });
    return merged;
  }, [sessionPayload?.recent_artifacts, sessionPayload?.recent_messages, stageMessages]);

  const buildConfirmRequired =
    sessionPayload?.session.current_step === "approve_build" && sessionPayload.session.auto_pick_top1 === false;

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

  const rightPanelViewModel = useMemo<RightPanelViewModel>(() => {
    const resolved = resolveGuidedActionViewModel({
      sessionId,
      status: sessionPayload?.session.status ?? "idle",
      currentScene,
      currentStep: sessionPayload?.session.current_step ?? "interview_collect",
      top3Count: sessionPayload?.latest_top3?.length ?? 0,
      selectedCandidateId: sessionPayload?.selected_candidate_id ?? null,
      buildConfirmRequired,
      runtimeGoalId,
      packReady,
      shouldQueueIntervention,
      canStartSession
    });
    return {
      ...resolved,
      modelSource: top3ModelSource
    };
  }, [
    buildConfirmRequired,
    canStartSession,
    currentScene,
    packReady,
    runtimeGoalId,
    sessionId,
    sessionPayload?.latest_top3?.length,
    sessionPayload?.selected_candidate_id,
    sessionPayload?.session.current_step,
    sessionPayload?.session.status,
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
    styleKeywords,
    setStyleKeywords,
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
    shouldQueueIntervention,
    queuedCommands,
    chatEntries,
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
