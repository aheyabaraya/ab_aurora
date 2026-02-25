import { env } from "../env";
import { FileStorageRepository } from "./file";
import { MemoryStorageRepository } from "./memory";
import { SupabaseStorageRepository } from "./supabase";
import type { StorageRepository } from "./types";

let singleton: StorageRepository | null = null;

const STORAGE_CONFIG_ERROR_MESSAGE =
  "Storage backend not configured for production. Set valid Supabase env vars or ALLOW_FILE_STORAGE_IN_PRODUCTION=true for ephemeral file storage.";

function canUseSupabase(): boolean {
  if (env.NODE_ENV === "test") {
    return false;
  }
  const hasServiceKey = env.SUPABASE_SERVICE_ROLE_KEY.length > 0;
  const hasUrl = env.NEXT_PUBLIC_SUPABASE_URL.length > 0;
  const hasLocalUrl =
    env.NEXT_PUBLIC_SUPABASE_URL.includes("127.0.0.1") || env.NEXT_PUBLIC_SUPABASE_URL.includes("localhost");
  const hasDevKey = env.SUPABASE_SERVICE_ROLE_KEY.startsWith("dev-");
  const hasPlaceholderKey = env.SUPABASE_SERVICE_ROLE_KEY.includes("replace-with");
  const hasPlaceholderUrl = env.NEXT_PUBLIC_SUPABASE_URL.includes("replace-with");
  return hasServiceKey && hasUrl && !hasPlaceholderKey && !hasPlaceholderUrl && !hasDevKey && !hasLocalUrl;
}

export function getStorageRepository(): StorageRepository {
  if (singleton) {
    return singleton;
  }

  if (env.NODE_ENV === "test") {
    singleton = new MemoryStorageRepository();
    return singleton;
  }

  if (canUseSupabase()) {
    singleton = new SupabaseStorageRepository();
    return singleton;
  }

  if (env.NODE_ENV === "production" && !env.ALLOW_FILE_STORAGE_IN_PRODUCTION) {
    throw new Error(STORAGE_CONFIG_ERROR_MESSAGE);
  }

  singleton = new FileStorageRepository();
  return singleton;
}
