import { sessionStartRequestSchema } from "../../../../lib/agent/schemas";
import {
  requireEntitlement,
  requireUser
} from "../../../../lib/auth/guards";
import { getRequestId, jsonOk, jsonRouteError } from "../../../../lib/api/http";
import { getStorageRepository } from "../../../../lib/storage";
import { env } from "../../../../lib/env";

export async function POST(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = await requireUser(request, requestId);
  if (!auth.ok) {
    return auth.response;
  }
  const entitlement = await requireEntitlement(auth.value, requestId);
  if (!entitlement.ok) {
    return entitlement.response;
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
      design_direction_note: input.design_direction_note,
      q0_intent_confidence: input.q0_intent_confidence,
      auto_continue: input.auto_continue ?? env.AUTO_CONTINUE,
      auto_pick_top1: input.auto_pick_top1 ?? env.AUTO_PICK_TOP1,
      owner_user_id: auth.value.authMode === "supabase" ? auth.value.userId : null
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
