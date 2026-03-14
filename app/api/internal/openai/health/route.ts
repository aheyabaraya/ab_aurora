import { runOpenAiHealthCheck } from "../../../../../lib/ai/openai-health";
import {
  requireEntitlement,
  requireUser
} from "../../../../../lib/auth/guards";
import { getRequestId, jsonOk, jsonRouteError } from "../../../../../lib/api/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
    const result = await runOpenAiHealthCheck();
    const body = {
      ...result,
      request_id: requestId
    };

    if (result.ok) {
      return jsonOk(body);
    }

    return jsonOk(body, { status: 503 });
  } catch (error) {
    return jsonRouteError(error, {
      requestId,
      context: "api.internal.openai.health"
    });
  }
}
