import { mintRequestSchema } from "../../../lib/agent/schemas";
import { assertApiToken } from "../../../lib/auth/api-token";
import { getRequestId, jsonError, jsonOk, jsonRouteError } from "../../../lib/api/http";
import { mintBrandPack } from "../../../lib/chain/monad";
import { getStorageRepository } from "../../../lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = getRequestId(new Headers(request.headers));
  const auth = assertApiToken(new Headers(request.headers));
  if (!auth.ok) {
    return jsonError("Unauthorized", 401, requestId);
  }

  try {
    const body = await request.json();
    const input = mintRequestSchema.parse(body);
    const storage = getStorageRepository();
    const pack = await storage.getPack(input.pack_id);
    if (!pack) {
      return jsonError("Resource not found", 404, requestId);
    }

    const result = await mintBrandPack({
      packId: pack.id,
      bundleHash: pack.bundle_hash
    });

    if (!result.enabled) {
      return jsonOk({
        status: "disabled",
        tx_hash: null,
        request_id: requestId
      });
    }

    const updatedPack = await storage.updatePack(pack.id, { mint_tx: result.txHash });
    return jsonOk({
      status: "submitted",
      tx_hash: updatedPack.mint_tx,
      request_id: requestId
    });
  } catch (error) {
    return jsonRouteError(error, {
      requestId,
      context: "api.mint",
      validationMessage: "Invalid mint payload"
    });
  }
}
