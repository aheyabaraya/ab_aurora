import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "./lib/env";

const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

function applySecurityHeaders(request: NextRequest, response: NextResponse): NextResponse {
  if (!env.SECURITY_HEADERS_STRICT) {
    return response;
  }

  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  response.headers.set("x-request-id", requestId);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  if (env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  return response;
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  return applySecurityHeaders(request, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
