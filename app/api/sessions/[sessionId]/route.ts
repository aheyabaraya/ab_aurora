import { getRequestId, jsonError, jsonOk } from "../../../../lib/api/http";
import { getStorageRepository } from "../../../../lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ sessionId: string }>;
  }
) {
  const requestId = getRequestId(new Headers(request.headers));
  const { sessionId } = await context.params;
  const storage = getStorageRepository();
  const session = await storage.getSession(sessionId);
  if (!session) {
    return jsonError("Resource not found", 404, requestId);
  }
  const artifacts = await storage.listArtifactsBySession(sessionId);
  return jsonOk({
    session,
    current_step: session.current_step,
    latest_top3: session.latest_top3,
    selected_candidate_id: session.selected_candidate_id,
    recent_artifacts: artifacts.slice(0, 20),
    request_id: requestId
  });
}
