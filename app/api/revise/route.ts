import { randomUUID } from "crypto";
import { reviseRequestSchema } from "../../../lib/agent/schemas";
import { runAgentPipeline } from "../../../lib/agent/orchestrator";
import { assertApiToken } from "../../../lib/auth/api-token";
import { getRequestId, jsonError, jsonOk, jsonRouteError } from "../../../lib/api/http";
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
    const input = reviseRequestSchema.parse(body);
    const storage = getStorageRepository();
    const session = await storage.getSession(input.session_id);
    if (!session) {
      return jsonError("Resource not found", 404, requestId);
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
