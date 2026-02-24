import { env } from "../env";
import { createHash, timingSafeEqual } from "crypto";

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function safeEquals(left: string, right: string): boolean {
  const leftHash = hashToken(left);
  const rightHash = hashToken(right);
  return timingSafeEqual(leftHash, rightHash);
}

export function assertApiToken(headers: Headers): { ok: true } | { ok: false } {
  const shouldRequireToken = env.NODE_ENV === "production" && env.API_TOKEN_REQUIRED;
  const configuredToken = env.API_BEARER_TOKEN;

  if (!shouldRequireToken) {
    return { ok: true };
  }

  if (!configuredToken) {
    return { ok: false };
  }

  const providedToken = headers.get("x-api-token");
  if (!providedToken) {
    return { ok: false };
  }
  if (!safeEquals(providedToken, configuredToken)) {
    return { ok: false };
  }

  return { ok: true };
}
