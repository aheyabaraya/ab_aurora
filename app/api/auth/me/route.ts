import { requireUser } from "../../../../lib/auth/guards";
import { getRequestId, jsonOk, jsonRouteError } from "../../../../lib/api/http";
import { getAuthStateSummary } from "../../../../lib/onboarding/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = await requireUser(request, requestId);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const summary = await getAuthStateSummary(auth.value.userId);
    return jsonOk({
      user_id: auth.value.userId,
      auth_mode: auth.value.authMode,
      onboarding_complete: summary.onboarding_complete,
      entitlements: summary.entitlements,
      request_id: requestId
    });
  } catch (error) {
    return jsonRouteError(error, {
      requestId,
      context: "api.auth.me"
    });
  }
}
