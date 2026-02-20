import { assertApiToken } from "../../../../../lib/auth/api-token";
import { getRequestId, jsonError, jsonOk } from "../../../../../lib/api/http";
import { getRuntimeGoalSnapshot } from "../../../../../lib/runtime/runner";
import { getStorageRepository } from "../../../../../lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ goalId: string }>;
  }
) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = assertApiToken(new Headers(request.headers));
  if (!auth.ok) {
    return jsonError("Unauthorized", 401, requestId);
  }

  const { goalId } = await context.params;
  const storage = getStorageRepository();
  const snapshot = await getRuntimeGoalSnapshot({
    storage,
    goal_id: goalId
  });

  if (!snapshot) {
    return jsonError("Resource not found", 404, requestId);
  }

  return jsonOk({
    goal: snapshot.goal,
    plans: snapshot.plans,
    actions: snapshot.actions,
    evals: snapshot.evals,
    memories: snapshot.memories,
    events: snapshot.events,
    tool_calls: snapshot.tool_calls,
    request_id: requestId
  });
}
