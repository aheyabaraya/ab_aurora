import { randomUUID } from "crypto";
import { reviseRequestSchema } from "../../../lib/agent/schemas";
import { runAgentPipeline } from "../../../lib/agent/orchestrator";
import {
  requireEntitlement,
  requireSessionOwnership,
  requireUser
} from "../../../lib/auth/guards";
import { getRequestId, jsonOk, jsonRouteError } from "../../../lib/api/http";
import { env } from "../../../lib/env";
import {
  ensureRuntimeGoalForSession,
  stepRuntimeGoal
} from "../../../lib/runtime/runner";
import { getStorageRepository } from "../../../lib/storage";

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
    const input = reviseRequestSchema.parse(body);
    const storage = getStorageRepository();
    const sessionAuth = await requireSessionOwnership({
      storage,
      auth: auth.value,
      sessionId: input.session_id,
      requestId
    });
    if (!sessionAuth.ok) {
      return sessionAuth.response;
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
          action_type: "revise_constraint",
          payload: {
            constraint: input.constraint,
            intensity: input.intensity ?? 50
          }
        },
        idempotency_key: randomUUID()
      });

      return jsonOk({
        status: runtimeResponse.goal_status,
        queued_job_id: runtimeResponse.last_action?.id ?? null,
        runtime_meta: {
          enabled: true,
          goal_id: runtimeResponse.goal.id,
          eval: runtimeResponse.eval
        },
        request_id: requestId
      });
    }

    const response = await runAgentPipeline({
      storage,
      request: {
        session_id: input.session_id,
        action: "revise_constraint",
        payload: {
          constraint: input.constraint,
          intensity: input.intensity ?? 50
        },
        idempotency_key: randomUUID()
      }
    });

    return jsonOk({
      status: response.status,
      queued_job_id: response.job_id,
      runtime_meta: {
        enabled: false
      },
      request_id: requestId
    });
  } catch (error) {
    return jsonRouteError(error, {
      requestId,
      context: "api.revise",
      validationMessage: "Invalid revise payload"
    });
  }
}
