import { randomUUID } from "crypto";
import { runStepRequestSchema } from "../../../../lib/agent/schemas";
import { runAgentPipeline } from "../../../../lib/agent/orchestrator";
import { assertApiToken } from "../../../../lib/auth/api-token";
import { getRequestId, jsonError, jsonOk, jsonRouteError } from "../../../../lib/api/http";
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
    const parsed = runStepRequestSchema.parse({
      ...body,
      idempotency_key: body.idempotency_key ?? idempotencyFromHeader ?? randomUUID()
    });

    const storage = getStorageRepository();
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
