"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/auth/supabase-client";

type OnboardingStartResponse = {
  authorize_url: string;
  state: string;
};

function base64UrlFromBytes(bytes: Uint8Array): string {
  let encoded = "";
  for (const byte of bytes) {
    encoded += String.fromCharCode(byte);
  }
  return btoa(encoded).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64UrlFromBytes(buffer);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64UrlFromBytes(new Uint8Array(digest));
}

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

async function isAlreadyOnboarded(accessToken: string): Promise<boolean> {
  const response = await fetch("/api/auth/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Auth check failed (${response.status}).`);
  }
  const body = (await response.json()) as { onboarding_complete?: boolean };
  return body.onboarding_complete === true;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initSession = async () => {
    setSessionBusy(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      setAccessToken(token);
      const onboarded = await isAlreadyOnboarded(token);
      if (onboarded) {
        router.replace("/");
      }
    } catch (sessionError) {
      const message = sessionError instanceof Error ? sessionError.message : "Failed to create session.";
      setError(message);
    } finally {
      setSessionBusy(false);
    }
  };

  const startOnboarding = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!accessToken) {
        throw new Error("Create session first.");
      }
      const state = randomToken(24);
      const nonce = randomToken(24);
      const codeVerifier = randomToken(48);
      const codeChallenge = await sha256Base64Url(codeVerifier);
      const redirectUri = `${window.location.origin}/onboarding/callback`;

      const response = await fetch("/api/onboarding/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          state,
          nonce,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
          redirect_uri: redirectUri
        })
      });

      const body = (await response.json()) as OnboardingStartResponse & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `Failed to start onboarding (${response.status}).`);
      }

      window.sessionStorage.setItem("ab_aurora_onboarding_state", state);
      window.sessionStorage.setItem("ab_aurora_onboarding_nonce", nonce);
      window.sessionStorage.setItem("ab_aurora_onboarding_code_verifier", codeVerifier);

      window.location.href = body.authorize_url;
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : "Failed to start onboarding.";
      setError(message);
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">AB Aurora</p>
        <h1 className="mt-2 text-xl font-semibold">Supabase Onboarding</h1>
        <p className="mt-2 text-sm text-slate-300">
          Continue with one-time onboarding code exchange. First create an anonymous session with the button below.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-emerald-300/50 bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50"
            onClick={() => {
              void initSession();
            }}
            disabled={sessionBusy || busy}
          >
            {sessionBusy ? "Creating Session..." : accessToken ? "Session Ready" : "Create Session"}
          </button>
          <button
            className="rounded-lg border border-cyan-300/50 bg-cyan-400/15 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-50"
            onClick={() => {
              void startOnboarding();
            }}
            disabled={busy || sessionBusy || !accessToken}
          >
            {busy ? "Starting..." : "Start Onboarding"}
          </button>
          <button
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200"
            onClick={() => router.push("/onboarding/callback")}
            disabled={busy || sessionBusy}
          >
            Manual Exchange
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
