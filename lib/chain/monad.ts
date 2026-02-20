import { env } from "../env";
import { sha256 } from "../utils/hash";

export async function mintBrandPack(input: {
  packId: string;
  bundleHash: string;
}): Promise<{ enabled: boolean; txHash: string | null }> {
  if (!env.ENABLE_MONAD_MINT) {
    return { enabled: false, txHash: null };
  }

  const txHash = `0x${sha256(`${input.packId}:${input.bundleHash}:${Date.now()}`).slice(0, 64)}`;
  return { enabled: true, txHash };
}
