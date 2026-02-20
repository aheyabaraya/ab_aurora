import { getRequestId, jsonError, jsonOk } from "../../../lib/api/http";
import { getStorageRepository } from "../../../lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return jsonError("Invalid request payload", 400, requestId);
  }

  const storage = getStorageRepository();
  const session = await storage.getSession(sessionId);
  if (!session) {
    return jsonError("Resource not found", 404, requestId);
  }
  return jsonOk({ session, request_id: requestId });
}
