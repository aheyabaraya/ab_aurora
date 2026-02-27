import { NextResponse } from "next/server";
import { getRequestId, jsonError, jsonRouteError } from "../../../../lib/api/http";
import { requireUser } from "../../../../lib/auth/guards";
import { env } from "../../../../lib/env";
import { onboardingStartRequestSchema } from "../../../../lib/onboarding/schemas";
import { OnboardingError, createOnboardingState } from "../../../../lib/onboarding/service";

export const dynamic = "force-dynamic";

function isAllowedRedirectUri(redirectUri: string): boolean {
  try {
    const appOrigin = new URL(env.APP_URL).origin;
    const redirectOrigin = new URL(redirectUri).origin;
    if (redirectOrigin === appOrigin) {
      return true;
    }
    if (env.NODE_ENV !== "production") {
      return redirectOrigin.includes("localhost") || redirectOrigin.includes("127.0.0.1");
    }
    return false;
  } catch {
    return false;
  }
}

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
    const input = onboardingStartRequestSchema.parse(body);
    if (!isAllowedRedirectUri(input.redirect_uri)) {
      return jsonError("Invalid redirect URI", 400, requestId);
    }

    const started = await createOnboardingState({
      userId: auth.value.userId,
      state: input.state,
      nonce: input.nonce,
      codeChallenge: input.code_challenge,
      redirectUri: input.redirect_uri
    });
    return NextResponse.json(
      {
        authorize_url: started.authorizeUrl,
        state: started.state,
        expires_at: started.expiresAt,
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
      context: "api.onboarding.start",
      validationMessage: "Invalid onboarding start payload"
    });
  }
}
