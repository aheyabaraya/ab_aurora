"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuroraClient } from "../aurora/AuroraClient";
import { getSupabaseBrowserClient } from "../../lib/auth/supabase-client";

type AuthMeResponse = {
  onboarding_complete: boolean;
};

async function ensureAnonymousSession(): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const initial = await supabase.auth.getSession();
  if (initial.data.session?.access_token) {
    return initial.data.session.access_token;
  }
  const signIn = await supabase.auth.signInAnonymously();
  if (signIn.error) {
    throw new Error("Failed to bootstrap anonymous session.");
  }
  const after = await supabase.auth.getSession();
  const token = after.data.session?.access_token;
  if (!token) {
    throw new Error("Anonymous session token is missing.");
  }
  return token;
}

async function fetchAuthMe(accessToken: string): Promise<AuthMeResponse> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Auth check failed (${response.status}).`);
  }
  return (await response.json()) as AuthMeResponse;
}

function HomeGateWithSession() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const accessToken = await ensureAnonymousSession();
        const me = await fetchAuthMe(accessToken);
        if (!active) {
          return;
        }
        if (!me.onboarding_complete) {
          router.replace("/onboarding");
          return;
        }
        setError(null);
        setReady(true);
      } catch (gateError) {
        if (!active) {
          return;
        }
        const message =
          gateError instanceof Error ? gateError.message : "Failed to load auth state.";
        setError(message);
      }
    })();

    return () => {
      active = false;
    };
  }, [attempt, router]);

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <section className="mx-auto max-w-xl rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm">
          <p>{error}</p>
          <button
            className="mt-3 rounded-md border border-slate-500 px-3 py-1 text-xs"
            onClick={() => {
              setReady(false);
              setError(null);
              setAttempt((prev) => prev + 1);
            }}
          >
            Retry
          </button>
        </section>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <section className="mx-auto max-w-xl rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm">
          <p>Checking session and onboarding status...</p>
        </section>
      </main>
    );
  }

  return <AuroraClient />;
}

export function HomeGate() {
  const authBypassEnabled =
    process.env.NODE_ENV === "test"
      ? process.env.NEXT_PUBLIC_AUTH_BYPASS_ENABLED === "true"
      : process.env.NEXT_PUBLIC_AUTH_BYPASS_ENABLED !== "false";
  if (authBypassEnabled) {
    return <AuroraClient />;
  }
  return <HomeGateWithSession />;
}
