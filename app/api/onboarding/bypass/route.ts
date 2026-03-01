import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getRequestId, jsonError, jsonRouteError } from "../../../../lib/api/http";
import { requireUser } from "../../../../lib/auth/guards";
import { env } from "../../../../lib/env";
import {
  OnboardingError,
  createOnboardingState,
  exchangeOnboardingCode,
  issueMockCodeByState
} from "../../../../lib/onboarding/service";

export const dynamic = "force-dynamic";

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function buildPkceChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
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

  if (!env.ONBOARDING_BYPASS_ENABLED) {
    return jsonError("Not found", 404, requestId);
  }
  if (!env.MOCK_ISSUER_ENABLED) {
    return jsonError("Mock issuer is disabled.", 503, requestId);
  }

  try {
    const state = randomToken(24);
    const nonce = randomToken(24);
    const codeVerifier = randomToken(48);
    const codeChallenge = buildPkceChallenge(codeVerifier);
    const redirectUri = new URL("/onboarding/callback", env.APP_URL).toString();

    await createOnboardingState({
      userId: auth.value.userId,
      state,
      nonce,
      codeChallenge,
      redirectUri
    });

    const issued = await issueMockCodeByState(state);
    const exchanged = await exchangeOnboardingCode({
      userId: auth.value.userId,
      state,
      nonce,
      codeVerifier,
      code: issued.code
    });

    return NextResponse.json(
      {
        onboarding_complete: exchanged.onboarding_complete,
        entitlement_key: exchanged.entitlement_key,
        entitlement_version: exchanged.entitlement_version,
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
      context: "api.onboarding.bypass"
    });
  }
}
