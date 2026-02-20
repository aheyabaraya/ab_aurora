import { sessionStartRequestSchema } from "../../../../lib/agent/schemas";
import { assertApiToken } from "../../../../lib/auth/api-token";
import { getRequestId, jsonError, jsonOk, jsonRouteError } from "../../../../lib/api/http";
import { getStorageRepository } from "../../../../lib/storage";
import { env } from "../../../../lib/env";

export async function POST(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = assertApiToken(new Headers(request.headers));
  if (!auth.ok) {
    return jsonError("Unauthorized", 401, requestId);
  }

  try {
    const body = await request.json();
    const input = sessionStartRequestSchema.parse(body);
    const storage = getStorageRepository();
    const session = await storage.createSession({
      mode: input.mode,
      product: input.product,
      audience: input.audience,
      style_keywords: input.style_keywords,
      auto_continue: input.auto_continue ?? env.AUTO_CONTINUE,
      auto_pick_top1: input.auto_pick_top1 ?? env.AUTO_PICK_TOP1
    });
    await storage.appendMessage({
      session_id: session.id,
      role: "system",
      content: "Session initialized for stage-based pipeline.",
      metadata: {
        mode: session.mode,
        auto_continue: session.auto_continue,
        auto_pick_top1: session.auto_pick_top1
      }
    });

    return jsonOk({
      session_id: session.id,
      current_step: session.current_step,
      config: {
        auto_continue: session.auto_continue,
        auto_pick_top1: session.auto_pick_top1
      },
      request_id: requestId
    });
  } catch (error) {
    return jsonRouteError(error, {
      requestId,
      context: "api.session.start",
      validationMessage: "Invalid session start payload"
    });
  }
}
