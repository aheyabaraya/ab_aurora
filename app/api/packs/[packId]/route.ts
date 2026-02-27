import {
  requireEntitlement,
  requirePackOwnership,
  requireUser
} from "../../../../lib/auth/guards";
import { getRequestId, jsonOk } from "../../../../lib/api/http";
import { getStorageRepository } from "../../../../lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ packId: string }>;
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

  const { packId } = await context.params;
  const storage = getStorageRepository();
  const packAuth = await requirePackOwnership({
    storage,
    auth: auth.value,
    packId,
    requestId
  });
  if (!packAuth.ok) {
    return packAuth.response;
  }
  const pack = packAuth.value;

  return jsonOk({
    pack_meta: pack.meta,
    bundle_hash: pack.bundle_hash,
    cid: pack.cid,
    mint_tx: pack.mint_tx,
    request_id: requestId
  });
}
