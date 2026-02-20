import { randomUUID } from "crypto";
import { chatRequestSchema } from "../../../lib/agent/schemas";
import { parseChatAction } from "../../../lib/agent/chat-action";
import { runAgentPipeline } from "../../../lib/agent/orchestrator";
import { assertApiToken } from "../../../lib/auth/api-token";
import { getRequestId, jsonError, jsonOk, jsonRouteError } from "../../../lib/api/http";
import { env } from "../../../lib/env";
import {
  ensureRuntimeGoalForSession,
  stepRuntimeGoal
} from "../../../lib/runtime/runner";
import { getStorageRepository } from "../../../lib/storage";

export const dynamic = "force-dynamic";

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

    await storage.appendMessage({
      session_id: session.id,
      role: "user",
      content: input.message
    });

    const action = parseChatAction(input.message);
    if (!env.ENABLE_AGENT_CHAT_CONTROL) {
      await storage.appendMessage({
        session_id: session.id,
        role: "assistant",
        content: "Chat control is disabled by environment configuration."
      });
      return jsonOk({
        interpreted_action: action,
        applied: false,
        status: session.status,
        current_step: session.current_step,
        artifacts_delta: [],
        runtime_meta: {
          enabled: env.RUNTIME_ENABLED
        },
        request_id: requestId
      });
    }

    if (env.RUNTIME_ENABLED) {
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

      await storage.appendMessage({
        session_id: session.id,
        role: "assistant",
        content: runtimeResponse.message,
        metadata: {
          action: action.type,
          wait_user: runtimeResponse.wait_user
        }
      });

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
      const artifactsDelta = Array.isArray(nestedRunResponse?.artifacts)
        ? (nestedRunResponse?.artifacts as unknown[])
        : [];

      return jsonOk({
        interpreted_action: action,
        applied: action.type !== "unknown",
        status: refreshedSession.status,
        current_step: refreshedSession.current_step,
        artifacts_delta: artifactsDelta,
        runtime_meta: {
          enabled: true,
          goal_id: runtimeResponse.goal.id,
          goal_status: runtimeResponse.goal_status,
          current_step_no: runtimeResponse.current_step_no,
          eval: runtimeResponse.eval
        },
        request_id: requestId
      });
    }

    const response = await runAgentPipeline({
      storage,
      request: {
        session_id: input.session_id,
        action: action.type,
        payload: action.payload,
        idempotency_key: randomUUID()
      }
    });

    await storage.appendMessage({
      session_id: session.id,
      role: "assistant",
      content: response.message,
      metadata: {
        action: action.type,
        wait_user: response.wait_user
      }
    });

    return jsonOk({
      interpreted_action: action,
      applied: action.type !== "unknown",
      status: response.status,
      current_step: response.current_step,
      artifacts_delta: response.artifacts,
      runtime_meta: {
        enabled: false
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
