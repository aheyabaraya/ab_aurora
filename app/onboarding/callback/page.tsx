"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/auth/supabase-client";

async function ensureAccessToken(): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const existing = await supabase.auth.getSession();
  if (existing.data.session?.access_token) {
    return existing.data.session.access_token;
  }
  const created = await supabase.auth.signInAnonymously();
  if (created.error) {
    throw new Error("Failed to create anonymous session.");
  }
  const refreshed = await supabase.auth.getSession();
  const token = refreshed.data.session?.access_token;
  if (!token) {
    throw new Error("Anonymous session token unavailable.");
  }
  return token;
}

type ExchangeSuccess = {
  onboarding_complete: boolean;
};

export default function OnboardingCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
          <section className="mx-auto max-w-xl rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">AB Aurora</p>
            <h1 className="mt-2 text-xl font-semibold">Onboarding Callback</h1>
            <p className="mt-2 text-sm text-slate-300">Loading callback parameters...</p>
          </section>
        </main>
      }
    >
      <OnboardingCallbackContent />
    </Suspense>
  );
}

function OnboardingCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const queryCode = searchParams.get("code");
    const queryState = searchParams.get("state");
    if (queryCode) {
      setCode(queryCode);
    }
    if (queryState) {
      setState(queryState);
    }
  }, [searchParams]);

  const exchange = async () => {
    setBusy(true);
    setError(null);
    try {
      const resolvedState = state.trim() || window.sessionStorage.getItem("ab_aurora_onboarding_state") || "";
      const nonce = window.sessionStorage.getItem("ab_aurora_onboarding_nonce") || "";
      const codeVerifier = window.sessionStorage.getItem("ab_aurora_onboarding_code_verifier") || "";
      if (!resolvedState || !nonce || !codeVerifier) {
        throw new Error("Onboarding verifier data missing. Restart onboarding.");
      }
      if (!code.trim()) {
        throw new Error("Onboarding code is required.");
      }

      const accessToken = await ensureAccessToken();
      const response = await fetch("/api/onboarding/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          state: resolvedState,
          nonce,
          code: code.trim(),
          code_verifier: codeVerifier
        })
      });
      const body = (await response.json()) as ExchangeSuccess & { error?: string; error_code?: string };
      if (!response.ok) {
        throw new Error(body.error_code ? `${body.error} (${body.error_code})` : body.error ?? "Code exchange failed.");
      }
      if (!body.onboarding_complete) {
        throw new Error("Onboarding exchange did not complete.");
      }

      window.sessionStorage.removeItem("ab_aurora_onboarding_state");
      window.sessionStorage.removeItem("ab_aurora_onboarding_nonce");
      window.sessionStorage.removeItem("ab_aurora_onboarding_code_verifier");
      router.replace("/");
    } catch (exchangeError) {
      const message = exchangeError instanceof Error ? exchangeError.message : "Code exchange failed.";
      setError(message);
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">AB Aurora</p>
        <h1 className="mt-2 text-xl font-semibold">Onboarding Callback</h1>
        <p className="mt-2 text-sm text-slate-300">
          Exchange one-time onboarding code. Query values should be auto-filled; manual input is supported.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-slate-200">Code</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="onboarding code"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-200">State</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              value={state}
              onChange={(event) => setState(event.target.value)}
              placeholder="state"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-cyan-300/50 bg-cyan-400/15 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-50"
            onClick={() => {
              void exchange();
            }}
            disabled={busy}
          >
            {busy ? "Exchanging..." : "Exchange Code"}
          </button>
          <button
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200"
            onClick={() => router.push("/onboarding")}
            disabled={busy}
          >
            Back
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-300/40 bg-rose-500/10 p-3 text-xs text-rose-100">
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}
