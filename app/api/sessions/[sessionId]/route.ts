import { z } from "zod";
import {
  requireEntitlement,
  requireSessionOwnership,
  requireUser
} from "../../../../lib/auth/guards";
import { getRequestId, jsonOk } from "../../../../lib/api/http";
import { runAgentPipeline } from "../../../../lib/agent/orchestrator";
import { toVariationWidth } from "../../../../lib/agent/candidate";
import { getStorageRepository } from "../../../../lib/storage";

export const dynamic = "force-dynamic";

const updateSessionSchema = z.object({
  product: z.string().trim().min(2).max(200),
  audience: z.string().trim().min(2).max(200),
  style_keywords: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
  constraint: z.string().trim().min(3).max(400),
  q0_intent_confidence: z.number().int().min(1).max(5).optional()
});

export async function GET(
  request: Request,
  context: {
    params: Promise<{ sessionId: string }>;
  }
) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = await requireUser(request, requestId);
  if (!auth.ok) {
    return auth.response;
  }
  const entitlement = await requireEntitlement(auth.value, requestId);
  if (!entitlement.ok) {
    return entitlement.response;
  }

  const { sessionId } = await context.params;
  const storage = getStorageRepository();
  const sessionAuth = await requireSessionOwnership({
    storage,
    auth: auth.value,
    sessionId,
    requestId
  });
  if (!sessionAuth.ok) {
    return sessionAuth.response;
  }
  const session = sessionAuth.value;
  const [artifacts, messages, usageSummary] = await Promise.all([
    storage.listArtifactsBySession(sessionId),
    storage.listMessagesBySession(sessionId, 50),
    storage.getUsageSummaryBySession(sessionId)
  ]);
  return jsonOk({
    session,
    current_step: session.current_step,
    latest_top3: session.latest_top3,
    selected_candidate_id: session.selected_candidate_id,
    recent_artifacts: artifacts.slice(0, 20),
    recent_messages: messages,
    usage_summary: usageSummary,
    request_id: requestId
  });
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ sessionId: string }>;
  }
) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = await requireUser(request, requestId);
  if (!auth.ok) {
    return auth.response;
  }
  const entitlement = await requireEntitlement(auth.value, requestId);
  if (!entitlement.ok) {
    return entitlement.response;
  }

  const { sessionId } = await context.params;
  const storage = getStorageRepository();
  const sessionAuth = await requireSessionOwnership({
    storage,
    auth: auth.value,
    sessionId,
    requestId
  });
  if (!sessionAuth.ok) {
    return sessionAuth.response;
  }
  const session = sessionAuth.value;
  const body = await request.json();
  const input = updateSessionSchema.parse(body);
  const q0IntentConfidence = input.q0_intent_confidence ?? session.intent_confidence ?? 3;

  await storage.updateSession(session.id, {
    product: input.product,
    audience: input.audience,
    style_keywords: input.style_keywords,
    constraint: input.constraint,
    intent_confidence: q0IntentConfidence,
    variation_width: toVariationWidth(q0IntentConfidence),
    latest_top3: null,
    selected_candidate_id: null,
    final_spec: null,
    draft_spec: null,
    revision_count: 0,
    current_step: "interview_collect",
    status: "running"
  });

  await runAgentPipeline({
    storage,
    request: {
      session_id: session.id,
      step: "interview_collect",
      payload: {
        bootstrap_until_direction: true
      },
      idempotency_key: crypto.randomUUID()
    }
  });

  const refreshed = await storage.getSession(session.id);
  const [artifacts, messages, usageSummary] = await Promise.all([
    storage.listArtifactsBySession(session.id),
    storage.listMessagesBySession(session.id, 50),
    storage.getUsageSummaryBySession(session.id)
  ]);

  return jsonOk({
    session: refreshed,
    current_step: refreshed?.current_step ?? "interview_collect",
    latest_top3: refreshed?.latest_top3 ?? null,
    selected_candidate_id: refreshed?.selected_candidate_id ?? null,
    recent_artifacts: artifacts.slice(0, 20),
    recent_messages: messages,
    usage_summary: usageSummary,
    request_id: requestId
  });
}
