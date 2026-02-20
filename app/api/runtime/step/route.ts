import { randomUUID } from "crypto";
import { assertApiToken } from "../../../../lib/auth/api-token";
import { getRequestId, jsonError, jsonOk, jsonRouteError } from "../../../../lib/api/http";
import { runtimeStepRequestSchema } from "../../../../lib/runtime/schemas";
import { stepRuntimeGoal } from "../../../../lib/runtime/runner";
import { getStorageRepository } from "../../../../lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = assertApiToken(new Headers(request.headers));
  if (!auth.ok) {
    return jsonError("Unauthorized", 401, requestId);
  }

  try {
    const body = await request.json();
    const idempotencyFromHeader = request.headers.get("x-idempotency-key");
    const parsed = runtimeStepRequestSchema.parse({
      ...body,
      idempotency_key: body.idempotency_key ?? idempotencyFromHeader ?? randomUUID()
    });

    const storage = getStorageRepository();
    const response = await stepRuntimeGoal({
      storage,
      goal_id: parsed.goal_id,
      force_replan: parsed.force_replan,
      action_override: parsed.action_override,
      idempotency_key: parsed.idempotency_key
    });

    return jsonOk({
      goal_status: response.goal_status,
      current_step_no: response.current_step_no,
      last_action: response.last_action,
      eval: response.eval,
      next_action: response.next_action,
      wait_user: response.wait_user,
      message: response.message,
      request_id: requestId
    });
  } catch (error) {
    return jsonRouteError(error, {
      requestId,
      context: "api.runtime.step",
      validationMessage: "Invalid runtime step payload"
    });
  }
}
