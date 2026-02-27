import { seedSessionRequestSchema } from "../../../../../lib/agent/schemas";
import { getRequestId, jsonError, jsonOk, jsonRouteError } from "../../../../../lib/api/http";
import { env } from "../../../../../lib/env";
import { getStorageRepository } from "../../../../../lib/storage";
import { buildSessionSeed } from "../../../../../lib/testing/session-seed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));

  if (env.NODE_ENV === "production") {
    return jsonError("Forbidden", 403, requestId);
  }

  if (!env.ENABLE_DEV_SEED_API) {
    return jsonError("Resource not found", 404, requestId);
  }

  const seedToken = request.headers.get("x-seed-token");
  if (!seedToken || seedToken !== env.DEV_SEED_TOKEN) {
    return jsonError("Unauthorized", 401, requestId);
  }

  try {
    const body = await request.json();
    const parsed = seedSessionRequestSchema.parse(body);
    const storage = getStorageRepository();
    const ownerUserIdHeader = request.headers.get("x-owner-user-id");
    const owner_user_id = ownerUserIdHeader && ownerUserIdHeader.trim().length > 0 ? ownerUserIdHeader.trim() : null;
    const seeded = await buildSessionSeed({
      storage,
      owner_user_id,
      preset: parsed.preset,
      mode: parsed.mode,
      product: parsed.product,
      audience: parsed.audience,
      style_keywords: parsed.style_keywords,
      auto_continue: parsed.auto_continue,
      auto_pick_top1: parsed.auto_pick_top1,
      with_runtime_goal: parsed.with_runtime_goal
    });

    return jsonOk({
      ...seeded,
      request_id: requestId
    });
  } catch (error) {
    return jsonRouteError(error, {
      requestId,
      context: "api.dev.seed.session",
      validationMessage: "Invalid seed session payload"
    });
  }
}
