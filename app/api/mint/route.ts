import { mintRequestSchema } from "../../../lib/agent/schemas";
import {
  requireEntitlement,
  requirePackOwnership,
  requireUser
} from "../../../lib/auth/guards";
import { getRequestId, jsonOk, jsonRouteError } from "../../../lib/api/http";
import { mintBrandPack } from "../../../lib/chain/monad";
import { getStorageRepository } from "../../../lib/storage";

export const dynamic = "force-dynamic";

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
    const input = mintRequestSchema.parse(body);
    const storage = getStorageRepository();
    const packAuth = await requirePackOwnership({
      storage,
      auth: auth.value,
      packId: input.pack_id,
      requestId
    });
    if (!packAuth.ok) {
      return packAuth.response;
    }
    const pack = packAuth.value;

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
