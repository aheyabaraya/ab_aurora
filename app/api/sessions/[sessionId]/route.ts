import {
  requireEntitlement,
  requireSessionOwnership,
  requireUser
} from "../../../../lib/auth/guards";
import { getRequestId, jsonOk } from "../../../../lib/api/http";
import { getStorageRepository } from "../../../../lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ sessionId: string }>;
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

  const { sessionId } = await context.params;
  const storage = getStorageRepository();
  const sessionAuth = await requireSessionOwnership({
    storage,
    auth: auth.value,
    sessionId,
    requestId
  });
  if (!sessionAuth.ok) {
    return sessionAuth.response;
  }
  const session = sessionAuth.value;
  const [artifacts, messages, usageSummary] = await Promise.all([
    storage.listArtifactsBySession(sessionId),
    storage.listMessagesBySession(sessionId, 50),
    storage.getUsageSummaryBySession(sessionId)
  ]);
  return jsonOk({
    session,
    current_step: session.current_step,
    latest_top3: session.latest_top3,
    selected_candidate_id: session.selected_candidate_id,
    recent_artifacts: artifacts.slice(0, 20),
    recent_messages: messages,
    usage_summary: usageSummary,
    request_id: requestId
  });
}
