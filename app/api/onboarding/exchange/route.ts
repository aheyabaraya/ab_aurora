import { NextResponse } from "next/server";
import { getRequestId, jsonRouteError } from "../../../../lib/api/http";
import { requireUser } from "../../../../lib/auth/guards";
import { onboardingExchangeRequestSchema } from "../../../../lib/onboarding/schemas";
import { OnboardingError, exchangeOnboardingCode } from "../../../../lib/onboarding/service";

export const dynamic = "force-dynamic";

function jsonOnboardingError(error: OnboardingError, requestId: string) {
  return NextResponse.json(
    {
      error: error.message,
      error_code: error.code,
      request_id: requestId
    },
    { status: error.status }
  );
}

export async function POST(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = await requireUser(request, requestId);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const input = onboardingExchangeRequestSchema.parse(body);
    const exchanged = await exchangeOnboardingCode({
      userId: auth.value.userId,
      state: input.state,
      nonce: input.nonce,
      codeVerifier: input.code_verifier,
      code: input.code
    });

    return NextResponse.json(
      {
        ...exchanged,
        request_id: requestId
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof OnboardingError) {
      return jsonOnboardingError(error, requestId);
    }
    return jsonRouteError(error, {
      requestId,
      context: "api.onboarding.exchange",
      validationMessage: "Invalid onboarding exchange payload"
    });
  }
}
