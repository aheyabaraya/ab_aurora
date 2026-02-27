import { randomUUID } from "crypto";
import { assertApiToken } from "../../../../../lib/auth/api-token";
import { getRequestId, jsonError, jsonOk, jsonRouteError } from "../../../../../lib/api/http";
import { mockEntitlementMutationSchema } from "../../../../../lib/onboarding/schemas";
import { setEntitlementStatus } from "../../../../../lib/onboarding/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = assertApiToken(new Headers(request.headers));
  if (!auth.ok) {
    return jsonError("Unauthorized", 401, requestId);
  }

  try {
    const body = await request.json();
    const input = mockEntitlementMutationSchema.parse(body);
    const updated = await setEntitlementStatus({
      userId: input.user_id,
      entitlementKey: input.entitlement_key,
      status: input.status,
      source: "ab_aurora_mock",
      eventId: `internal-${randomUUID()}`,
      payload: {
        reason: "internal_mock_mutation"
      }
    });
    return jsonOk({
      entitlement: {
        user_id: updated.supabase_user_id,
        key: updated.entitlement_key,
        status: updated.status,
        version: updated.version
      },
      request_id: requestId
    });
  } catch (error) {
    return jsonRouteError(error, {
      requestId,
      context: "api.internal.mock-entitlements.revoke",
      validationMessage: "Invalid entitlement mutation payload"
    });
  }
}
