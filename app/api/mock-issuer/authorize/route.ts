import { NextResponse } from "next/server";
import { getRequestId, jsonError, jsonRouteError } from "../../../../lib/api/http";
import { OnboardingError, issueMockCodeByState } from "../../../../lib/onboarding/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));
  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state");
  if (!state) {
    return jsonError("Missing state", 400, requestId);
  }

  try {
    const issued = await issueMockCodeByState(state);
    const callback = new URL(issued.redirectUri);
    callback.searchParams.set("code", issued.code);
    callback.searchParams.set("state", state);
    return NextResponse.redirect(callback, { status: 302 });
  } catch (error) {
    if (error instanceof OnboardingError) {
      return NextResponse.json(
        {
          error: error.message,
          error_code: error.code,
          request_id: requestId
        },
        { status: error.status }
      );
    }
    return jsonRouteError(error, {
      requestId,
      context: "api.mock-issuer.authorize"
    });
  }
}
