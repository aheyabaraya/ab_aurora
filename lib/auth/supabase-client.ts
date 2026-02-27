"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "dev-anon-key";
  return {
    url,
    anonKey
  };
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }
  const { url, anonKey } = getSupabasePublicConfig();
  browserClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });
  return browserClient;
}
