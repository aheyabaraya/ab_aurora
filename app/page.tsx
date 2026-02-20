"use client";

import { useEffect, useMemo, useState } from "react";

const STEPS = [
  "interview_collect",
  "intent_gate",
  "spec_draft",
  "candidates_generate",
  "top3_select",
  "approve_build",
  "package",
  "done"
] as const;

type Candidate = {
  id: string;
  rank: number;
  score: number;
  naming: {
    recommended: string;
    candidates: string[];
  };
  moodboard: {
    title: string;
    prompt: string;
    colors: string[];
  };
  ui_plan: {
    headline: string;
    layout: string[];
    cta: string;
  };
  rationale: string;
};

type SessionPayload = {
  session: {
    id: string;
    mode: "mode_a" | "mode_b";
    product: string;
    audience: string;
    style_keywords: string[];
    current_step: string;
    status: string;
    auto_continue: boolean;
    auto_pick_top1: boolean;
    selected_candidate_id: string | null;
  };
  latest_top3: Candidate[] | null;
  selected_candidate_id: string | null;
  recent_artifacts: Array<{
    id: string;
    kind: string;
    title: string;
    created_at: string;
    content: Record<string, unknown>;
  }>;
};

type JobsPayload = {
  jobs: Array<{
    id: string;
    step: string;
    status: string;
    error: string | null;
    created_at: string;
  }>;
};

type RuntimeGoalSnapshot = {
  goal: {
    id: string;
    status: string;
    current_step_no: number;
    error: string | null;
  };
  actions: Array<{
    id: string;
    action_type: string;
    tool_name: string;
    status: string;
    created_at: string;
  }>;
  evals: Array<{
    id: string;
    pass: boolean;
    scores: Record<string, number>;
    next_hint: string | null;
    created_at: string;
  }>;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : "Request failed");
  }
  return body as T;
}

function toPrettyStep(step: string): string {
  return step.replaceAll("_", " ");
}

export default function HomePage() {
  const [mode, setMode] = useState<"mode_a" | "mode_b">("mode_b");
  const [product, setProduct] = useState("AI landing page builder for solo founders");
  const [audience, setAudience] = useState("Early-stage builders shipping in public");
  const [styleKeywords, setStyleKeywords] = useState("bold, editorial, futuristic");
  const [autoContinue, setAutoContinue] = useState(true);
  const [autoPickTop1, setAutoPickTop1] = useState(true);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionPayload, setSessionPayload] = useState<SessionPayload | null>(null);
  const [jobsPayload, setJobsPayload] = useState<JobsPayload | null>(null);
  const [runtimeGoalId, setRuntimeGoalId] = useState<string | null>(null);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<RuntimeGoalSnapshot | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [reviseInput, setReviseInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeStepIndex = useMemo(() => {
    if (!sessionPayload?.session.current_step) {
      return 0;
    }
    const index = STEPS.findIndex((step) => step === sessionPayload.session.current_step);
    return index < 0 ? 0 : index;
  }, [sessionPayload?.session.current_step]);

  const refreshSession = async (id: string) => {
    const [session, jobs] = await Promise.all([
      requestJson<SessionPayload>(`/api/sessions/${id}`),
      requestJson<JobsPayload>(`/api/jobs?session_id=${id}`)
    ]);
    setSessionPayload(session);
    setJobsPayload(jobs);
  };

  const refreshRuntimeGoal = async (goalId: string) => {
    const snapshot = await requestJson<RuntimeGoalSnapshot>(`/api/runtime/goals/${goalId}`);
    setRuntimeSnapshot(snapshot);
  };

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    const interval = setInterval(() => {
      refreshSession(sessionId).catch((refreshError) => {
        setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh session");
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [sessionId]);

  useEffect(() => {
    if (!runtimeGoalId) {
      return;
    }
    const interval = setInterval(() => {
      refreshRuntimeGoal(runtimeGoalId).catch((runtimeError) => {
        setError(runtimeError instanceof Error ? runtimeError.message : "Failed to refresh runtime goal");
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [runtimeGoalId]);

  const handleStartSession = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await requestJson<{
        session_id: string;
      }>("/api/session/start", {
        method: "POST",
        body: JSON.stringify({
          mode,
          product,
          audience,
          style_keywords: styleKeywords
            .split(",")
            .map((keyword) => keyword.trim())
            .filter(Boolean),
          auto_continue: autoContinue,
          auto_pick_top1: autoPickTop1
        })
      });
      setSessionId(response.session_id);
      setRuntimeGoalId(null);
      setRuntimeSnapshot(null);
      await refreshSession(response.session_id);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Failed to start session");
    } finally {
      setBusy(false);
    }
  };

  const handleRunStep = async () => {
    if (!sessionId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await requestJson<{
        runtime_meta?: {
          enabled?: boolean;
          goal_id?: string;
        };
      }>("/api/agent/run-step", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          idempotency_key: crypto.randomUUID()
        })
      });
      if (response.runtime_meta?.goal_id) {
        setRuntimeGoalId(response.runtime_meta.goal_id);
        await refreshRuntimeGoal(response.runtime_meta.goal_id);
      }
      await refreshSession(sessionId);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Run step failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSelectCandidate = async (candidateId: string) => {
    if (!sessionId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await requestJson<{
        runtime_meta?: {
          enabled?: boolean;
          goal_id?: string;
        };
      }>("/api/agent/run-step", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          action: "select_candidate",
          payload: {
            candidate_id: candidateId
          },
          idempotency_key: crypto.randomUUID()
        })
      });
      if (response.runtime_meta?.goal_id) {
        setRuntimeGoalId(response.runtime_meta.goal_id);
        await refreshRuntimeGoal(response.runtime_meta.goal_id);
      }
      await refreshSession(sessionId);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Candidate selection failed");
    } finally {
      setBusy(false);
    }
  };

  const handleChat = async () => {
    if (!sessionId || !chatInput.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await requestJson<{
        runtime_meta?: {
          enabled?: boolean;
          goal_id?: string;
        };
      }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          message: chatInput
        })
      });
      if (response.runtime_meta?.goal_id) {
        setRuntimeGoalId(response.runtime_meta.goal_id);
        await refreshRuntimeGoal(response.runtime_meta.goal_id);
      }
      setChatInput("");
      await refreshSession(sessionId);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Chat command failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRevise = async () => {
    if (!sessionId || !reviseInput.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await requestJson<{
        runtime_meta?: {
          enabled?: boolean;
          goal_id?: string;
        };
      }>("/api/revise", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          constraint: reviseInput,
          intensity: 60
        })
      });
      if (response.runtime_meta?.goal_id) {
        setRuntimeGoalId(response.runtime_meta.goal_id);
        await refreshRuntimeGoal(response.runtime_meta.goal_id);
      }
      setReviseInput("");
      await refreshSession(sessionId);
    } catch (reviseError) {
      setError(reviseError instanceof Error ? reviseError.message : "Revision failed");
    } finally {
      setBusy(false);
    }
  };

  const handleStartRuntimeGoal = async () => {
    if (!sessionId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await requestJson<{
        goal_id: string;
      }>("/api/runtime/start", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          goal_type: "deliver_demo_pack",
          idempotency_key: crypto.randomUUID()
        })
      });
      setRuntimeGoalId(response.goal_id);
      await refreshRuntimeGoal(response.goal_id);
    } catch (runtimeError) {
      setError(runtimeError instanceof Error ? runtimeError.message : "Failed to start runtime goal");
    } finally {
      setBusy(false);
    }
  };

  const handleRuntimeStep = async (forceReplan = false) => {
    if (!runtimeGoalId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestJson("/api/runtime/step", {
        method: "POST",
        body: JSON.stringify({
          goal_id: runtimeGoalId,
          force_replan: forceReplan,
          idempotency_key: crypto.randomUUID()
        })
      });
      await Promise.all([refreshRuntimeGoal(runtimeGoalId), sessionId ? refreshSession(sessionId) : Promise.resolve()]);
    } catch (runtimeError) {
      setError(runtimeError instanceof Error ? runtimeError.message : "Runtime step failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRuntimeControl = async (message: string) => {
    if (!sessionId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await requestJson<{
        runtime_meta?: {
          goal_id?: string;
        };
      }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          message
        })
      });
      if (response.runtime_meta?.goal_id) {
        setRuntimeGoalId(response.runtime_meta.goal_id);
        await refreshRuntimeGoal(response.runtime_meta.goal_id);
      } else if (runtimeGoalId) {
        await refreshRuntimeGoal(runtimeGoalId);
      }
      await refreshSession(sessionId);
    } catch (runtimeControlError) {
      setError(runtimeControlError instanceof Error ? runtimeControlError.message : "Runtime control failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#133B5C_0%,#0D1A2B_48%,#111827_100%)] px-5 py-8 text-slate-100">
      <section className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1.1fr_1.6fr_1.1fr]">
        <article className="rounded-2xl border border-cyan-300/20 bg-slate-950/55 p-5 shadow-[0_14px_38px_-22px_rgba(8,145,178,0.8)] backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">AB_Aurora Agent</p>
          <h1 className="mt-2 text-2xl font-semibold text-cyan-100">Top-3 Pipeline Console</h1>
          <p className="mt-2 text-sm text-slate-300">
            Stage-driven orchestration with auto top-1, chat control, and artifact timeline.
          </p>

          <div className="mt-5 space-y-3">
            <label className="block text-sm">
              <span className="text-slate-300">Mode</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                value={mode}
                onChange={(event) => setMode(event.target.value as "mode_a" | "mode_b")}
              >
                <option value="mode_a">Mode A (Reference)</option>
                <option value="mode_b">Mode B (Guided)</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-slate-300">Product</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                value={product}
                onChange={(event) => setProduct(event.target.value)}
              />
            </label>

            <label className="block text-sm">
              <span className="text-slate-300">Audience</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
              />
            </label>

            <label className="block text-sm">
              <span className="text-slate-300">Style keywords (comma separated)</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                value={styleKeywords}
                onChange={(event) => setStyleKeywords(event.target.value)}
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={autoContinue}
                onChange={(event) => setAutoContinue(event.target.checked)}
              />
              Auto continue
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={autoPickTop1}
                onChange={(event) => setAutoPickTop1(event.target.checked)}
              />
              Auto pick top-1
            </label>

            <button
              className="w-full rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:opacity-60"
              onClick={handleStartSession}
              disabled={busy}
            >
              Start Session
            </button>

            {sessionId ? (
              <button
                className="w-full rounded-lg border border-cyan-300/40 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/10 disabled:opacity-60"
                onClick={handleRunStep}
                disabled={busy}
              >
                Run / Continue
              </button>
            ) : null}

            {sessionId ? (
              <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Runtime Goal</p>
                <button
                  className="w-full rounded-lg border border-fuchsia-300/40 px-3 py-2 text-xs font-semibold text-fuchsia-100 hover:bg-fuchsia-400/10 disabled:opacity-60"
                  onClick={handleStartRuntimeGoal}
                  disabled={busy}
                >
                  Start Runtime Goal
                </button>
                <button
                  className="w-full rounded-lg border border-cyan-300/40 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-60"
                  onClick={() => handleRuntimeStep(false)}
                  disabled={busy || !runtimeGoalId}
                >
                  Runtime Step
                </button>
                <button
                  className="w-full rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/10 disabled:opacity-60"
                  onClick={() => handleRuntimeStep(true)}
                  disabled={busy || !runtimeGoalId}
                >
                  Force Replan + Step
                </button>
                <button
                  className="w-full rounded-lg border border-rose-300/40 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-400/10 disabled:opacity-60"
                  onClick={() => handleRuntimeControl("pause")}
                  disabled={busy || !sessionId}
                >
                  Pause (Chat Control)
                </button>
                <button
                  className="w-full rounded-lg border border-emerald-300/40 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/10 disabled:opacity-60"
                  onClick={() => handleRuntimeControl("resume")}
                  disabled={busy || !sessionId}
                >
                  Resume (Chat Control)
                </button>
                {runtimeSnapshot ? (
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2 text-[11px] text-slate-300">
                    <p>
                      Goal: <span className="text-cyan-200">{runtimeSnapshot.goal.id}</span>
                    </p>
                    <p>Status: {runtimeSnapshot.goal.status}</p>
                    <p>Loop Step: {runtimeSnapshot.goal.current_step_no}</p>
                    <p>
                      Last Action:{" "}
                      {runtimeSnapshot.actions[0]
                        ? `${runtimeSnapshot.actions[0].action_type} (${runtimeSnapshot.actions[0].status})`
                        : "n/a"}
                    </p>
                    <p>
                      Eval:{" "}
                      {runtimeSnapshot.evals[0]
                        ? runtimeSnapshot.evals[0].pass
                          ? "pass"
                          : "fail"
                        : "n/a"}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
        </article>

        <article className="rounded-2xl border border-cyan-300/20 bg-slate-950/55 p-5 backdrop-blur">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Execution Plane</p>
              <h2 className="text-xl font-semibold text-cyan-100">Stage Timeline + Top-3</h2>
            </div>
            {sessionPayload ? (
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                {sessionPayload.session.status}
              </span>
            ) : null}
          </header>

          <ol className="grid gap-2 sm:grid-cols-2">
            {STEPS.map((step, index) => (
              <li
                key={step}
                className={`rounded-lg border px-3 py-2 text-xs uppercase tracking-wide ${
                  index < activeStepIndex
                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                    : index === activeStepIndex
                      ? "border-cyan-300/60 bg-cyan-400/10 text-cyan-100"
                      : "border-slate-700 text-slate-400"
                }`}
              >
                {toPrettyStep(step)}
              </li>
            ))}
          </ol>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {(sessionPayload?.latest_top3 ?? []).map((candidate) => {
              const selected = sessionPayload?.selected_candidate_id === candidate.id;
              return (
                <div
                  key={candidate.id}
                  className={`rounded-xl border p-3 ${
                    selected
                      ? "border-cyan-300 bg-cyan-400/10"
                      : "border-slate-700 bg-slate-900/60"
                  }`}
                >
                  <p className="text-xs text-slate-400">Rank #{candidate.rank}</p>
                  <h3 className="mt-1 text-sm font-semibold text-cyan-100">{candidate.naming.recommended}</h3>
                  <p className="mt-1 text-xs text-slate-300">{candidate.rationale}</p>
                  <p className="mt-2 text-[11px] text-slate-400">Score: {candidate.score.toFixed(3)}</p>
                  <button
                    className="mt-3 w-full rounded-md border border-cyan-300/40 px-2 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10"
                    onClick={() => handleSelectCandidate(candidate.id)}
                    disabled={busy}
                  >
                    {selected ? "Selected" : "Select Candidate"}
                  </button>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-cyan-300/20 bg-slate-950/55 p-5 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Control Plane</p>
          <h2 className="mt-1 text-xl font-semibold text-cyan-100">Chat + Artifacts + Jobs</h2>

          <div className="mt-4 space-y-2">
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              placeholder='e.g. "2번 후보로 바꿔"'
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
            />
            <button
              className="w-full rounded-lg border border-cyan-300/40 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-60"
              onClick={handleChat}
              disabled={busy || !sessionId}
            >
              Send Chat Command
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              placeholder="Revise constraint"
              value={reviseInput}
              onChange={(event) => setReviseInput(event.target.value)}
            />
            <button
              className="w-full rounded-lg border border-emerald-300/40 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/10 disabled:opacity-60"
              onClick={handleRevise}
              disabled={busy || !sessionId}
            >
              Revise and Re-run
            </button>
          </div>

          <div className="mt-5 max-h-44 overflow-auto rounded-lg border border-slate-700 bg-slate-900/50 p-2">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Recent Artifacts</p>
            {(sessionPayload?.recent_artifacts ?? []).map((artifact) => (
              <div key={artifact.id} className="mb-2 rounded-md border border-slate-700 p-2 text-xs">
                <p className="font-semibold text-cyan-100">{artifact.title}</p>
                <p className="text-slate-400">{artifact.kind}</p>
                <p className="line-clamp-2 text-slate-300">{JSON.stringify(artifact.content)}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 max-h-40 overflow-auto rounded-lg border border-slate-700 bg-slate-900/50 p-2">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Job Stream</p>
            {(jobsPayload?.jobs ?? []).map((job) => (
              <div key={job.id} className="mb-2 rounded-md border border-slate-700 p-2 text-xs">
                <p className="font-semibold text-slate-100">{job.step}</p>
                <p className="text-slate-300">{job.status}</p>
                {job.error ? <p className="text-rose-300">{job.error}</p> : null}
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
