import {
  requireEntitlement,
  requireSessionOwnership,
  requireUser
} from "../../../lib/auth/guards";
import { getRequestId, jsonError, jsonOk } from "../../../lib/api/http";
import { getStorageRepository } from "../../../lib/storage";

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

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return jsonError("Invalid request payload", 400, requestId);
  }

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
  return jsonOk({ session: sessionAuth.value, request_id: requestId });
}
