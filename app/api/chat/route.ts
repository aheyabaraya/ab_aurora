import { randomUUID } from "crypto";
import { chatRequestSchema } from "../../../lib/agent/schemas";
import { parseChatAction } from "../../../lib/agent/chat-action";
import { runAgentPipeline } from "../../../lib/agent/orchestrator";
import type { Candidate, SessionRecord } from "../../../lib/agent/types";
import {
  buildFallbackAssistantReply,
  buildRateLimitedAssistantReply,
  generateAssistantChatReply,
  type ChatOptionHint
} from "../../../lib/ai/openai-chat";
import { assertApiToken } from "../../../lib/auth/api-token";
import { getRequestId, jsonError, jsonOk, jsonRouteError } from "../../../lib/api/http";
import { env } from "../../../lib/env";
import {
  ensureRuntimeGoalForSession,
  stepRuntimeGoal
} from "../../../lib/runtime/runner";
import { getStorageRepository } from "../../../lib/storage";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

type AssistantSource = "openai" | "rate_limited" | "fallback";

function buildOptionHints(session: SessionRecord): ChatOptionHint[] {
  const hints: ChatOptionHint[] = [];
  const top3 = (session.latest_top3 ?? []).slice(0, 3);

  if (session.current_step === "top3_select" || session.current_step === "approve_build") {
    top3.forEach((candidate: Candidate, index: number) => {
      hints.push({
        command: `/pick ${index + 1}`,
        title: candidate.naming.recommended,
        description: candidate.rationale.slice(0, 96)
      });
    });
    hints.push({
      command: "/regen top3",
      title: "Top-3 regenerate",
      description: "새로운 3개 후보를 다시 생성합니다."
    });
  }

  if (session.current_step === "approve_build" && session.auto_pick_top1 === false) {
    hints.push({
      command: "/build",
      title: "Build confirm",
      description: "선택한 후보를 확정하고 package 단계로 진행합니다."
    });
  }

  if (session.current_step === "package" || session.current_step === "done") {
    hints.push({
      command: "/export",
      title: "Export zip",
      description: "현재 패키지를 zip으로 내보냅니다."
    });
    hints.push({
      command: "/regen outputs",
      title: "Regenerate outputs",
      description: "산출물만 다시 생성합니다."
    });
  }

  hints.push({
    command: "/run",
    title: "Continue",
    description: "현재 stage의 다음 실행을 진행합니다."
  });

  const unique = new Map<string, ChatOptionHint>();
  for (const hint of hints) {
    if (!unique.has(hint.command)) {
      unique.set(hint.command, hint);
    }
  }
  return [...unique.values()].slice(0, 5);
}

function countOpenAiAssistantMessages(messages: Array<{ role: string; metadata: Record<string, unknown> | null; created_at: string }>): number {
  const now = Date.now();
  return messages.filter((message) => {
    if (message.role !== "assistant") {
      return false;
    }
    if (message.metadata?.provider !== "openai_chat") {
      return false;
    }
    const createdAtMs = new Date(message.created_at).getTime();
    if (Number.isNaN(createdAtMs)) {
      return false;
    }
    return now - createdAtMs <= DAY_MS;
  }).length;
}

async function safeTrackUsage(storage: ReturnType<typeof getStorageRepository>, input: { session_id: string; type: string; amount: number }) {
  try {
    await storage.trackUsage(input);
  } catch {
    // Usage tracking must not block chat response path.
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = assertApiToken(new Headers(request.headers));
  if (!auth.ok) {
    return jsonError("Unauthorized", 401, requestId);
  }

  try {
    const body = await request.json();
    const input = chatRequestSchema.parse(body);
    const storage = getStorageRepository();
    const session = await storage.getSession(input.session_id);
    if (!session) {
      return jsonError("Resource not found", 404, requestId);
    }

    if (!env.OPENAI_API_KEY) {
      return jsonError("OPENAI_API_KEY is required for /api/chat.", 503, requestId);
    }

    await storage.appendMessage({
      session_id: session.id,
      role: "user",
      content: input.message
    });

    const action = parseChatAction(input.message);
    let applied = false;
    let status = session.status;
    let currentStep = session.current_step;
    let artifactsDelta: unknown[] = [];
    let runtimeMeta: Record<string, unknown> = {
      enabled: env.RUNTIME_ENABLED
    };
    let pipelineMessage = "";

    if (!env.ENABLE_AGENT_CHAT_CONTROL) {
      pipelineMessage = "Chat control is disabled by environment configuration.";
      applied = false;
    } else if (env.RUNTIME_ENABLED) {
      const goal = await ensureRuntimeGoalForSession({
        storage,
        session_id: input.session_id
      });
      const runtimeResponse = await stepRuntimeGoal({
        storage,
        goal_id: goal.id,
        action_override: {
          action_type: action.type,
          payload: action.payload
        },
        idempotency_key: randomUUID()
      });

      const refreshedSession = await storage.getSession(session.id);
      if (!refreshedSession) {
        throw new Error(`Session not found: ${session.id}`);
      }

      const legacyOutput =
        runtimeResponse.last_action?.output &&
        typeof runtimeResponse.last_action.output === "object"
          ? (runtimeResponse.last_action.output as Record<string, unknown>)
          : {};
      const nestedRunResponse =
        legacyOutput.run_response &&
        typeof legacyOutput.run_response === "object"
          ? (legacyOutput.run_response as Record<string, unknown>)
          : null;
      artifactsDelta = Array.isArray(nestedRunResponse?.artifacts)
        ? (nestedRunResponse?.artifacts as unknown[])
        : [];
      pipelineMessage = runtimeResponse.message;
      applied = action.type !== "unknown";
      status = refreshedSession.status;
      currentStep = refreshedSession.current_step;
      runtimeMeta = {
        enabled: true,
        goal_id: runtimeResponse.goal.id,
        goal_status: runtimeResponse.goal_status,
        current_step_no: runtimeResponse.current_step_no,
        eval: runtimeResponse.eval
      };
    } else {
      const response = await runAgentPipeline({
        storage,
        request: {
          session_id: input.session_id,
          action: action.type,
          payload: action.payload,
          idempotency_key: randomUUID()
        }
      });
      pipelineMessage = response.message;
      applied = action.type !== "unknown";
      status = response.status;
      currentStep = response.current_step;
      artifactsDelta = response.artifacts;
      runtimeMeta = {
        enabled: false
      };
    }

    const latestSession = await storage.getSession(session.id);
    if (!latestSession) {
      throw new Error(`Session not found after chat execution: ${session.id}`);
    }
    const optionHints = buildOptionHints(latestSession);

    const rateLimitWindowSize = Math.max(env.CHAT_OPENAI_LIMIT_PER_DAY * 4, 256);
    const recentMessages = await storage.listMessagesBySession(session.id, rateLimitWindowSize);
    const usedBefore = countOpenAiAssistantMessages(recentMessages);
    const overLimit = usedBefore >= env.CHAT_OPENAI_LIMIT_PER_DAY;

    let assistantSource: AssistantSource = "fallback";
    let assistantMessage = "";
    if (overLimit) {
      assistantSource = "rate_limited";
      assistantMessage = buildRateLimitedAssistantReply({
        pipelineMessage,
        optionHints
      });
      await safeTrackUsage(storage, {
        session_id: session.id,
        type: "openai_chat_rate_limited",
        amount: 1
      });
    } else {
      try {
        assistantMessage = await generateAssistantChatReply({
          userMessage: input.message,
          actionType: action.type,
          pipelineMessage,
          sessionSnapshot: {
            current_step: latestSession.current_step,
            status: latestSession.status,
            product: latestSession.product,
            audience: latestSession.audience,
            style_keywords: latestSession.style_keywords,
            selected_candidate_id: latestSession.selected_candidate_id,
            auto_pick_top1: latestSession.auto_pick_top1
          },
          optionHints
        });
        assistantSource = "openai";
        await safeTrackUsage(storage, {
          session_id: session.id,
          type: "openai_chat",
          amount: 1
        });
      } catch {
        assistantSource = "fallback";
        assistantMessage = buildFallbackAssistantReply({
          pipelineMessage,
          optionHints
        });
      }
    }

    const used = assistantSource === "openai" ? usedBefore + 1 : usedBefore;
    const remaining = Math.max(env.CHAT_OPENAI_LIMIT_PER_DAY - used, 0);
    const rateLimited = assistantSource === "rate_limited";

    await storage.appendMessage({
      session_id: session.id,
      role: "assistant",
      content: assistantMessage,
      metadata: {
        action: action.type,
        provider: assistantSource === "openai" ? "openai_chat" : `openai_chat_${assistantSource}`,
        assistant_source: assistantSource,
        rate_limited: rateLimited,
        rate_limit: {
          limit: env.CHAT_OPENAI_LIMIT_PER_DAY,
          used,
          remaining
        }
      }
    });

    return jsonOk({
      interpreted_action: action,
      applied,
      status,
      current_step: currentStep,
      artifacts_delta: artifactsDelta,
      runtime_meta: runtimeMeta,
      assistant_source: assistantSource,
      rate_limited: rateLimited,
      rate_limit: {
        limit: env.CHAT_OPENAI_LIMIT_PER_DAY,
        used,
        remaining
      },
      request_id: requestId
    });
  } catch (error) {
    return jsonRouteError(error, {
      requestId,
      context: "api.chat",
      validationMessage: "Invalid chat payload"
    });
  }
}
