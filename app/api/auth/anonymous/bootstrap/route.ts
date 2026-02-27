import { requireUser } from "../../../../../lib/auth/guards";
import { getRequestId, jsonOk } from "../../../../../lib/api/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = await requireUser(request, requestId);
  if (!auth.ok) {
    return auth.response;
  }

  return jsonOk({
    user_id: auth.value.userId,
    auth_mode: auth.value.authMode,
    request_id: requestId
  });
}
