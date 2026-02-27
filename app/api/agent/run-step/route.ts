import { randomUUID } from "crypto";
import { runStepRequestSchema } from "../../../../lib/agent/schemas";
import { runAgentPipeline } from "../../../../lib/agent/orchestrator";
import {
  requireEntitlement,
  requireSessionOwnership,
  requireUser
} from "../../../../lib/auth/guards";
import { getRequestId, jsonOk, jsonRouteError } from "../../../../lib/api/http";
import { env } from "../../../../lib/env";
import {
  ensureRuntimeGoalForSession,
  stepRuntimeGoal
} from "../../../../lib/runtime/runner";
import { getStorageRepository } from "../../../../lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = await requireUser(request, requestId);
  if (!auth.ok) {
    return auth.response;
  }
  const entitlement = await requireEntitlement(auth.value, requestId);
  if (!entitlement.ok) {
    return entitlement.response;
  }

  try {
    const body = await request.json();
    const idempotencyFromHeader = request.headers.get("x-idempotency-key");
    const parsed = runStepRequestSchema.parse({
      ...body,
      idempotency_key: body.idempotency_key ?? idempotencyFromHeader ?? randomUUID()
    });

    const storage = getStorageRepository();
    const sessionAuth = await requireSessionOwnership({
      storage,
      auth: auth.value,
      sessionId: parsed.session_id,
      requestId
    });
    if (!sessionAuth.ok) {
      return sessionAuth.response;
    }

    if (env.RUNTIME_ENABLED) {
      const goal = await ensureRuntimeGoalForSession({
        storage,
        session_id: parsed.session_id,
        idempotency_key: `rt-goal-${parsed.idempotency_key}`
      });
      const runtimeResponse = await stepRuntimeGoal({
        storage,
        goal_id: goal.id,
        action_override: parsed.action
          ? {
              action_type: parsed.action,
              payload: parsed.payload
            }
          : undefined,
        idempotency_key: parsed.idempotency_key
      });

      const sessionBeforeStep = sessionAuth.value;
      const sessionAfterStep =
        (await storage.getSession(parsed.session_id)) ?? sessionBeforeStep;

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
      const nextStepFromTool =
        typeof nestedRunResponse?.next_step === "string"
          ? nestedRunResponse.next_step
          : sessionAfterStep.current_step;
      const toolJobId =
        typeof nestedRunResponse?.job_id === "string"
          ? nestedRunResponse.job_id
          : null;

        return jsonOk({
        status: sessionAfterStep.status,
        current_step: sessionAfterStep.current_step,
        next_step: nextStepFromTool,
        wait_user:
          runtimeResponse.wait_user || sessionAfterStep.status === "wait_user",
        job_id: toolJobId,
        artifacts: artifactsDelta,
        selected_candidate_id: sessionAfterStep.selected_candidate_id,
        latest_top3: sessionAfterStep.latest_top3,
        message: runtimeResponse.message,
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
        session_id: parsed.session_id,
        step: parsed.step,
        action: parsed.action,
        payload: parsed.payload,
        idempotency_key: parsed.idempotency_key
      }
    });

    return jsonOk({
      ...response,
      runtime_meta: {
        enabled: false
      },
      request_id: requestId
    });
  } catch (error) {
    return jsonRouteError(error, {
      requestId,
      context: "api.agent.run-step",
      validationMessage: "Invalid run-step payload"
    });
  }
}
