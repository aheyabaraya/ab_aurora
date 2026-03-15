"use client";

import { AURORA_ASSETS, createAuroraPageStyle } from "./aurora-assets";
import { ChatDock } from "./ChatDock";
import { PackageChecklist } from "./PackageChecklist";
import { Progress4 } from "./Progress4";
import { SceneRouter } from "./SceneRouter";
import { Top3Cards } from "./Top3Cards";
import { AGENT_STEPS } from "./types";
import type { useAuroraController } from "./useAuroraController";

type AuroraController = ReturnType<typeof useAuroraController>;

type ProConsoleProps = {
  controller: AuroraController;
  onSwitchUiMode: (mode: "guided" | "pro") => void;
};

function toPrettyStep(step: string): string {
  return step.replaceAll("_", " ");
}

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

export function ProConsole({ controller, onSwitchUiMode }: ProConsoleProps) {
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
    top3ModelSource,
    busy,
    error,
    errorStatus,
    canRetry,
    showSignIn,
    setShowSignIn,
    currentScene,
    activeStepIndex,
    chatEntries,
    queuedCommands,
    shouldQueueIntervention,
    buildConfirmRequired,
    executeSlashCommand,
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

  const pageStyle = createAuroraPageStyle();
  const stage = sessionPayload?.session.current_step ?? "interview_collect";
  const status = sessionPayload?.session.status ?? "idle";
  const latestTop3 = sessionPayload?.latest_top3 ?? [];

  return (
    <main className="aurora-page min-h-screen px-5 py-8 text-slate-100" style={pageStyle}>
      <section className="mx-auto grid max-w-[90rem] gap-5 lg:grid-cols-[1.05fr_1.4fr_1.1fr]">
        <article className="rounded-2xl border border-cyan-300/20 bg-slate-950/55 p-5 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">AB_Aurora Agent</p>
            <button
              className="text-xs text-cyan-200 underline-offset-4 hover:underline"
              onClick={() => onSwitchUiMode("guided")}
            >
              Switch to Guided
            </button>
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
          <header className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Execution Plane</p>
              <h2 className="text-xl font-semibold text-cyan-100">Stage Timeline + Scene Canvas</h2>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wider ${statusBadge(status)}`}>
              {status}
            </span>
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

          <div className="mt-5">
            <Progress4 scene={currentScene} />
            <div className="mt-4">
              <SceneRouter scene={currentScene} stage={stage}>
                {!sessionId ? (
                  <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/70">
                    <div
                      className="h-52 bg-cover bg-center"
                      style={{
                        backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.24), rgba(2,6,23,0.85)), url(${AURORA_ASSETS.heroDesktop})`
                      }}
                    />
                    <div className="space-y-2 p-4 text-sm text-slate-200">
                      <p>Start a session to enter DEFINE and move through scenes automatically.</p>
                    </div>
                  </div>
                ) : null}

                {sessionId && currentScene === "DEFINE" ? (
                  <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/70">
                    <div
                      className="h-52 bg-cover bg-center"
                      style={{
                        backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.24), rgba(2,6,23,0.85)), url(${AURORA_ASSETS.heroSquare})`
                      }}
                    />
                    <div className="space-y-2 p-4 text-sm text-slate-200">
                      <p>Interview + intent gate + draft spec are unified as DEFINE.</p>
                      <p>Current stage: {stage}</p>
                    </div>
                  </div>
                ) : null}

                {sessionId && currentScene === "EXPLORE" ? (
                  latestTop3.length === 0 ? (
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
                  )
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
          status={status}
          modelSource={top3ModelSource}
          usageSummary={sessionPayload?.usage_summary ?? null}
          onSendChat={(message) => void handleSendChat(message)}
          onQuickAction={(actionId) => void handleQuickAction(actionId)}
          onExecuteSlash={(raw) => executeSlashCommand(raw)}
          onForceQueued={(queueId) => void handleForceQueued(queueId)}
          onDiscardQueued={handleDiscardQueued}
        />
      </section>

      {showSignIn ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-cyan-300/30 bg-slate-950 p-4">
            <p className="text-sm font-semibold text-cyan-100">Session Sign-in</p>
            <p className="mt-1 text-xs text-slate-300">Re-bootstrap anonymous Supabase session for protected routes.</p>
            <div className="mt-3 flex gap-2">
              <button
                className="rounded-lg border border-cyan-300/45 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10"
                onClick={() => void handleSaveApiToken()}
              >
                Reconnect
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
