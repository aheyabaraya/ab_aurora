import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ZodError } from "zod";
import { redactForLogs } from "../security/redact";

const RESOURCE_NOT_FOUND_PATTERNS = [
  /^Session not found/i,
  /^Session not found for update/i,
  /^Runtime goal not found/i,
  /^Pack not found/i,
  /^Job not found/i
];

function shouldReturnResourceNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return RESOURCE_NOT_FOUND_PATTERNS.some((pattern) => pattern.test(error.message));
}

function shouldReturnBadRequest(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error instanceof SyntaxError;
}

function shouldReturnServiceUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /^Storage backend not configured for production/i.test(error.message);
}

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function getRequestId(headers?: Headers): string {
  const requestId = headers?.get("x-request-id");
  if (requestId && requestId.trim().length > 0) {
    return requestId;
  }
  return randomUUID();
}

export function jsonError(
  message: string,
  status = 400,
  requestId = getRequestId()
): NextResponse<{ error: string; request_id: string }> {
  return NextResponse.json(
    {
      error: message,
      request_id: requestId
    },
    { status }
  );
}

export function jsonRouteError(
  error: unknown,
  input: {
    requestId: string;
    context: string;
    validationMessage?: string;
  }
): NextResponse<{ error: string; request_id: string }> {
  if (error instanceof ZodError) {
    return jsonError(input.validationMessage ?? "Invalid request payload", 400, input.requestId);
  }
  if (shouldReturnBadRequest(error)) {
    return jsonError(input.validationMessage ?? "Invalid request payload", 400, input.requestId);
  }
  if (shouldReturnResourceNotFound(error)) {
    return jsonError("Resource not found", 404, input.requestId);
  }
  if (shouldReturnServiceUnavailable(error)) {
    return jsonError(
      "Storage backend is not configured for production. Check Supabase env or enable ALLOW_FILE_STORAGE_IN_PRODUCTION.",
      503,
      input.requestId
    );
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(
    "[api.route.error]",
    redactForLogs({
      request_id: input.requestId,
      context: input.context,
      error: errorMessage
    })
  );
  return jsonError("Internal server error", 500, input.requestId);
}
