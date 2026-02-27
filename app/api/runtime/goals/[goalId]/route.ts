import {
  requireEntitlement,
  requireGoalOwnership,
  requireUser
} from "../../../../../lib/auth/guards";
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
  const auth = await requireUser(request, requestId);
  if (!auth.ok) {
    return auth.response;
  }
  const entitlement = await requireEntitlement(auth.value, requestId);
  if (!entitlement.ok) {
    return entitlement.response;
  }

  const { goalId } = await context.params;
  const storage = getStorageRepository();
  const goalAuth = await requireGoalOwnership({
    storage,
    auth: auth.value,
    goalId,
    requestId
  });
  if (!goalAuth.ok) {
    return goalAuth.response;
  }
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
