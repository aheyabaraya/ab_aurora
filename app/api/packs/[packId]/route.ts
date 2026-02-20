import { getRequestId, jsonError, jsonOk } from "../../../../lib/api/http";
import { getStorageRepository } from "../../../../lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ packId: string }>;
  }
) {
  const requestId = getRequestId(new Headers(request.headers));
  const { packId } = await context.params;
  const storage = getStorageRepository();
  const pack = await storage.getPack(packId);
  if (!pack) {
    return jsonError("Resource not found", 404, requestId);
  }

  return jsonOk({
    pack_meta: pack.meta,
    bundle_hash: pack.bundle_hash,
    cid: pack.cid,
    mint_tx: pack.mint_tx,
    request_id: requestId
  });
}
