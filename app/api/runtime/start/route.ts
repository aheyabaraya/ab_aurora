import { randomUUID } from "crypto";
import { assertApiToken } from "../../../../lib/auth/api-token";
import { getRequestId, jsonError, jsonOk, jsonRouteError } from "../../../../lib/api/http";
import { runtimeStartRequestSchema } from "../../../../lib/runtime/schemas";
import { startRuntimeGoal } from "../../../../lib/runtime/runner";
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
    const parsed = runtimeStartRequestSchema.parse({
      ...body,
      idempotency_key: body.idempotency_key ?? idempotencyFromHeader ?? randomUUID()
    });

    const storage = getStorageRepository();
    const started = await startRuntimeGoal({
      storage,
      session_id: parsed.session_id,
      goal_type: parsed.goal_type,
      goal_input: parsed.goal_input,
      idempotency_key: parsed.idempotency_key
    });

    return jsonOk({
      goal_id: started.goal.id,
      status: started.goal.status,
      initial_plan: started.initial_plan,
      current_action: started.current_action,
      request_id: requestId
    });
  } catch (error) {
    return jsonRouteError(error, {
      requestId,
      context: "api.runtime.start",
      validationMessage: "Invalid runtime start payload"
    });
  }
}
