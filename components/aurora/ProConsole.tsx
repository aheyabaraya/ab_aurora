"use client";

import { AGENT_STEPS } from "./types";
import { createAuroraPageStyle } from "./aurora-assets";
import { ChatDock } from "./ChatDock";
import type { useAuroraController } from "./useAuroraController";

type AuroraController = ReturnType<typeof useAuroraController>;

type ProConsoleProps = {
  controller: AuroraController;
};

function toPrettyStep(step: string): string {
  return step.replaceAll("_", " ");
}

export function ProConsole({ controller }: ProConsoleProps) {
  const {
    mode,
    setMode,
    product,
    setProduct,
    audience,
    setAudience,
    styleKeywords,
    setStyleKeywords,
    autoContinue,
    setAutoContinue,
    autoPickTop1,
    setAutoPickTop1,
    sessionId,
    sessionPayload,
    jobsPayload,
    runtimeGoalId,
    runtimeSnapshot,
    busy,
    error,
    errorStatus,
    canRetry,
    showSignIn,
    setShowSignIn,
    tokenDraft,
    setTokenDraft,
    activeStepIndex,
    chatEntries,
    queuedCommands,
    shouldQueueIntervention,
    handleStartSession,
    handleRunStep,
    handleSelectCandidate,
    handleSendChat,
    handleQuickAction,
    handleStartRuntimeGoal,
    handleRuntimeStep,
    handleRuntimeControl,
    handleForceQueued,
    handleDiscardQueued,
    handleRetryLastAction,
    handleSaveApiToken
  } = controller;

  const pageStyle = createAuroraPageStyle();

  return (
    <main className="aurora-page min-h-screen px-5 py-8 text-slate-100" style={pageStyle}>
      <section className="mx-auto grid max-w-[90rem] gap-5 lg:grid-cols-[1.05fr_1.4fr_1.1fr]">
        <article className="rounded-2xl border border-cyan-300/20 bg-slate-950/55 p-5 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">AB_Aurora Agent</p>
            <a href="?ui=guided" className="text-xs text-cyan-200 underline-offset-4 hover:underline">
              Switch to Guided
            </a>
          </div>

          <h1 className="mt-2 text-2xl font-semibold text-cyan-100">Pro Console</h1>
          <p className="mt-2 text-sm text-slate-300">Stage timeline, runtime controls, raw jobs.</p>

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
              <span className="text-slate-300">Style keywords</span>
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
              <input type="checkbox" checked={autoPickTop1} onChange={(event) => setAutoPickTop1(event.target.checked)} />
              Auto pick top-1
            </label>

            <button
              className="w-full rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:opacity-60"
              onClick={() => void handleStartSession()}
              disabled={busy}
            >
              Start Session
            </button>

            {sessionId ? (
              <button
                className="w-full rounded-lg border border-cyan-300/40 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/10 disabled:opacity-60"
                onClick={() => void handleRunStep()}
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
                  onClick={() => void handleStartRuntimeGoal()}
                  disabled={busy}
                >
                  Start Runtime Goal
                </button>
                <button
                  className="w-full rounded-lg border border-cyan-300/40 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-60"
                  onClick={() => void handleRuntimeStep(false)}
                  disabled={busy || !runtimeGoalId}
                >
                  Runtime Step
                </button>
                <button
                  className="w-full rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/10 disabled:opacity-60"
                  onClick={() => void handleRuntimeStep(true)}
                  disabled={busy || !runtimeGoalId}
                >
                  Force Replan + Step
                </button>
                <button
                  className="w-full rounded-lg border border-rose-300/40 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-400/10 disabled:opacity-60"
                  onClick={() => void handleRuntimeControl("pause")}
                  disabled={busy || !sessionId}
                >
                  Pause (Chat Control)
                </button>
                <button
                  className="w-full rounded-lg border border-emerald-300/40 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/10 disabled:opacity-60"
                  onClick={() => void handleRuntimeControl("resume")}
                  disabled={busy || !sessionId}
                >
                  Resume (Chat Control)
                </button>
                {runtimeSnapshot ? (
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2 text-[11px] text-slate-300">
                    <p>Goal: {runtimeSnapshot.goal.id}</p>
                    <p>Status: {runtimeSnapshot.goal.status}</p>
                    <p>Loop Step: {runtimeSnapshot.goal.current_step_no}</p>
                    <p>
                      Last Action:{" "}
                      {runtimeSnapshot.actions[0]
                        ? `${runtimeSnapshot.actions[0].action_type} (${runtimeSnapshot.actions[0].status})`
                        : "n/a"}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-rose-300/35 bg-rose-500/10 p-3 text-xs text-rose-100">
              <p>{error}</p>
              <div className="mt-2 flex gap-2">
                {canRetry ? (
                  <button
                    className="rounded-md border border-rose-300/60 px-2 py-1 text-[11px] hover:bg-rose-500/15"
                    onClick={() => void handleRetryLastAction()}
                  >
                    Retry
                  </button>
                ) : null}
                {errorStatus === 401 ? (
                  <button
                    className="rounded-md border border-cyan-300/60 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/15"
                    onClick={() => setShowSignIn(true)}
                  >
                    Sign-in
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
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
            {AGENT_STEPS.map((step, index) => (
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
                    selected ? "border-cyan-300 bg-cyan-400/10" : "border-slate-700 bg-slate-900/60"
                  }`}
                >
                  <p className="text-xs text-slate-400">Rank #{candidate.rank}</p>
                  <h3 className="mt-1 text-sm font-semibold text-cyan-100">{candidate.naming.recommended}</h3>
                  <p className="mt-1 text-xs text-slate-300">{candidate.rationale}</p>
                  <p className="mt-2 text-[11px] text-slate-400">Score: {candidate.score.toFixed(3)}</p>
                  <button
                    className="mt-3 w-full rounded-md border border-cyan-300/40 px-2 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10"
                    onClick={() => void handleSelectCandidate(candidate.id)}
                    disabled={busy}
                  >
                    {selected ? "Selected" : "Select Candidate"}
                  </button>
                </div>
              );
            })}
          </div>
        </article>

        <ChatDock
          entries={chatEntries}
          artifacts={sessionPayload?.recent_artifacts ?? []}
          jobs={jobsPayload?.jobs ?? []}
          queuedCommands={queuedCommands}
          shouldQueueIntervention={shouldQueueIntervention}
          busy={busy}
          sessionReady={Boolean(sessionId)}
          guided={false}
          defaultTab="jobs"
          onSendChat={(message) => void handleSendChat(message)}
          onQuickAction={(actionId) => void handleQuickAction(actionId)}
          onForceQueued={(queueId) => void handleForceQueued(queueId)}
          onDiscardQueued={handleDiscardQueued}
        />
      </section>

      {showSignIn ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-cyan-300/30 bg-slate-950 p-4">
            <p className="text-sm font-semibold text-cyan-100">API Sign-in</p>
            <p className="mt-1 text-xs text-slate-300">Set x-api-token for protected routes.</p>
            <input
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              value={tokenDraft}
              onChange={(event) => setTokenDraft(event.target.value)}
              placeholder="x-api-token"
            />
            <div className="mt-3 flex gap-2">
              <button
                className="rounded-lg border border-cyan-300/45 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10"
                onClick={handleSaveApiToken}
              >
                Save
              </button>
              <button
                className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                onClick={() => setShowSignIn(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
