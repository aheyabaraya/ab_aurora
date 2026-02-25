"use client";

import { useMemo, useState } from "react";
import { AURORA_ASSETS, createAuroraPageStyle } from "./aurora-assets";
import { ChatDock } from "./ChatDock";
import { PackageChecklist } from "./PackageChecklist";
import { Progress4 } from "./Progress4";
import { SceneRouter } from "./SceneRouter";
import { Top3Cards } from "./Top3Cards";
import type { useAuroraController } from "./useAuroraController";

type AuroraController = ReturnType<typeof useAuroraController>;

type GuidedConsoleProps = {
  controller: AuroraController;
  onSwitchUiMode: (mode: "guided" | "pro") => void;
};

function statusBadge(status: string): string {
  if (status === "completed") {
    return "border-emerald-300/60 bg-emerald-500/15 text-emerald-100";
  }
  if (status === "running") {
    return "border-cyan-300/60 bg-cyan-500/15 text-cyan-100";
  }
  if (status === "wait_user") {
    return "border-amber-300/60 bg-amber-500/15 text-amber-100";
  }
  if (status === "failed") {
    return "border-rose-300/60 bg-rose-500/15 text-rose-100";
  }
  return "border-slate-700 bg-slate-900/70 text-slate-200";
}

export function GuidedConsole({ controller, onSwitchUiMode }: GuidedConsoleProps) {
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
    currentScene,
    chatEntries,
    queuedCommands,
    shouldQueueIntervention,
    buildConfirmRequired,
    handleStartSession,
    handleRunStep,
    handleSelectCandidate,
    handleConfirmBuild,
    handleSendChat,
    handleQuickAction,
    handleRegenerateTop3,
    handleRegenerateOutputs,
    handleExportZip,
    handleStartRuntimeGoal,
    handleRuntimeStep,
    handleRuntimeControl,
    handleForceQueued,
    handleDiscardQueued,
    handleRetryLastAction,
    handleSaveApiToken
  } = controller;

  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const leftCollapsed = Boolean(sessionId) && expandedSessionId !== sessionId;

  const stage = sessionPayload?.session.current_step ?? "interview_collect";
  const status = sessionPayload?.session.status ?? "idle";
  const latestTop3 = sessionPayload?.latest_top3 ?? [];

  const sectionGridClass = useMemo(() => {
    if (leftCollapsed && sessionId) {
      return "mx-auto grid max-w-[90rem] gap-4 lg:grid-cols-[0.35fr_1.55fr_1fr]";
    }
    return "mx-auto grid max-w-[90rem] gap-4 lg:grid-cols-[0.95fr_1.45fr_1fr]";
  }, [leftCollapsed, sessionId]);

  const pageStyle = useMemo(() => createAuroraPageStyle(), []);

  return (
    <main className="aurora-page min-h-screen px-4 py-6 text-slate-100 md:px-6" style={pageStyle}>
      <section className={sectionGridClass}>
        <article className="rounded-2xl border border-cyan-300/20 bg-slate-950/55 p-4 shadow-[0_16px_36px_-24px_rgba(34,211,238,0.45)] backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">Setup/Runtime</p>
            {sessionId ? (
              <button
                className="rounded-md border border-cyan-300/35 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10"
                onClick={() => {
                  if (!sessionId) {
                    return;
                  }
                  setExpandedSessionId((value) => (value === sessionId ? null : sessionId));
                }}
              >
                {leftCollapsed ? "Expand" : "Collapse"}
              </button>
            ) : null}
          </div>

          {leftCollapsed && sessionId ? (
            <div className="mt-4 space-y-2 text-xs text-slate-300">
              <p>Session: {sessionPayload?.session.id ?? sessionId}</p>
              <p>Step: {stage}</p>
              <p>Status: {status}</p>
              <button
                className="mt-2 w-full rounded-lg border border-cyan-300/45 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/10 disabled:opacity-60"
                onClick={() => setExpandedSessionId(sessionId)}
              >
                Open controls
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
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
                <input
                  type="checkbox"
                  checked={autoPickTop1}
                  onChange={(event) => setAutoPickTop1(event.target.checked)}
                />
                Auto pick top-1
              </label>

              <button
                className="w-full rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60"
                onClick={() => void handleStartSession()}
                disabled={busy}
              >
                Start Session
              </button>

              {sessionId ? (
                <button
                  className="w-full rounded-lg border border-cyan-300/45 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-60"
                  onClick={() => void handleRunStep()}
                  disabled={busy}
                >
                  Run / Continue
                </button>
              ) : null}

              {sessionId ? (
                <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Runtime controls</p>
                  <button
                    className="w-full rounded-lg border border-fuchsia-300/40 px-3 py-2 text-xs font-semibold text-fuchsia-100 hover:bg-fuchsia-400/10"
                    onClick={() => void handleStartRuntimeGoal()}
                    disabled={busy}
                  >
                    Start Runtime Goal
                  </button>
                  <button
                    className="w-full rounded-lg border border-cyan-300/40 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10"
                    onClick={() => void handleRuntimeStep(false)}
                    disabled={busy || !runtimeGoalId}
                  >
                    Runtime Step
                  </button>
                  <button
                    className="w-full rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/10"
                    onClick={() => void handleRuntimeStep(true)}
                    disabled={busy || !runtimeGoalId}
                  >
                    Force Replan + Step
                  </button>
                  <button
                    className="w-full rounded-lg border border-rose-300/40 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-400/10"
                    onClick={() => void handleRuntimeControl("pause")}
                    disabled={busy}
                  >
                    Pause
                  </button>
                  <button
                    className="w-full rounded-lg border border-emerald-300/40 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/10"
                    onClick={() => void handleRuntimeControl("resume")}
                    disabled={busy}
                  >
                    Resume
                  </button>
                  {runtimeSnapshot ? (
                    <div className="rounded-md border border-slate-700 bg-slate-950/70 p-2 text-[11px] text-slate-300">
                      <p>Goal: {runtimeSnapshot.goal.id}</p>
                      <p>Status: {runtimeSnapshot.goal.status}</p>
                      <p>Loop Step: {runtimeSnapshot.goal.current_step_no}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          {error ? (
            <div className="mt-4 rounded-lg border border-rose-300/35 bg-rose-500/10 p-3 text-xs text-rose-100">
              <p>{error}</p>
              <div className="mt-2 flex flex-wrap gap-2">
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

          <button
            className="mt-4 inline-block text-xs text-cyan-200 underline-offset-4 hover:underline"
            onClick={() => onSwitchUiMode("pro")}
          >
            Switch to Pro Console
          </button>
        </article>

        <article className="rounded-2xl border border-cyan-300/20 bg-slate-950/55 p-5 backdrop-blur">
          <header className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Scene Canvas</p>
              <h1 className="text-2xl font-semibold text-cyan-100">Aurora Guided Flow</h1>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wider ${statusBadge(status)}`}>
              {status}
            </span>
          </header>

          <Progress4 scene={currentScene} status={status} />

          <div className="mt-5">
            <SceneRouter scene={currentScene} stage={stage}>
              {!sessionId ? (
                <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/70">
                  <div
                    className="h-52 bg-cover bg-center"
                    style={{
                      backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.24), rgba(2,6,23,0.85)), url(${AURORA_ASSETS.heroDesktop})`
                    }}
                  />
                  <div className="space-y-2 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Define</p>
                    <p className="text-sm text-slate-200">
                      Start a session to map interview and intent gate into one continuous scene.
                    </p>
                  </div>
                </div>
              ) : null}

              {sessionId && currentScene === "DEFINE" ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/70">
                    <div
                      className="h-56 bg-cover bg-center"
                      style={{
                        backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.25), rgba(2,6,23,0.82)), url(${AURORA_ASSETS.heroSquare})`
                      }}
                    />
                    <div className="space-y-2 p-4 text-sm text-slate-200">
                      <p>Interview + intent gate + draft spec are merged as one DEFINE scene.</p>
                      <p>Current stage: {stage}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {sessionId && currentScene === "EXPLORE" ? (
                <div className="space-y-4">
                  {latestTop3.length === 0 ? (
                    <div className="rounded-2xl border border-cyan-300/25 bg-slate-950/70 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-cyan-100">Generating Top-3...</p>
                      <div className="mt-3 space-y-2">
                        <div className="h-3 w-full animate-pulse rounded bg-cyan-500/20" />
                        <div className="h-3 w-4/5 animate-pulse rounded bg-cyan-500/20" />
                        <div className="h-3 w-3/5 animate-pulse rounded bg-cyan-500/20" />
                      </div>
                    </div>
                  ) : (
                    <Top3Cards
                      candidates={latestTop3}
                      selectedCandidateId={sessionPayload?.selected_candidate_id ?? null}
                      busy={busy}
                      buildRequired={false}
                      onSelect={(candidateId) => void handleSelectCandidate(candidateId)}
                      onConfirmBuild={() => void handleConfirmBuild()}
                    />
                  )}
                </div>
              ) : null}

              {sessionId && currentScene === "DECIDE" ? (
                <Top3Cards
                  candidates={latestTop3}
                  selectedCandidateId={sessionPayload?.selected_candidate_id ?? null}
                  busy={busy}
                  buildRequired={buildConfirmRequired}
                  onSelect={(candidateId) => void handleSelectCandidate(candidateId)}
                  onConfirmBuild={() => void handleConfirmBuild()}
                />
              ) : null}

              {sessionId && currentScene === "PACKAGE" ? (
                <PackageChecklist
                  artifacts={sessionPayload?.recent_artifacts ?? []}
                  currentStep={stage}
                  finalSpec={(sessionPayload?.session.final_spec ?? null) as Record<string, unknown> | null}
                  busy={busy}
                  onRegenerateOutputs={() => void handleRegenerateOutputs()}
                  onRegenerateTop3={() => void handleRegenerateTop3()}
                  onExportZip={() => void handleExportZip()}
                />
              ) : null}
            </SceneRouter>
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
          guided
          defaultTab="chat"
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
