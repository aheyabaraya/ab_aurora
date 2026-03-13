"use client";

import { useMemo } from "react";
import { createAuroraPageStyle } from "./aurora-assets";
import { ChatDock } from "./ChatDock";
import { Progress4 } from "./Progress4";
import { SceneRouter } from "./SceneRouter";
import { DecideScene } from "./scenes/DecideScene";
import { DefineScene } from "./scenes/DefineScene";
import { ExploreScene } from "./scenes/ExploreScene";
import { PackageScene } from "./scenes/PackageScene";
import type { useAuroraController } from "./useAuroraController";

type AuroraController = ReturnType<typeof useAuroraController>;

type GuidedConsoleProps = {
  controller: AuroraController;
};

export function GuidedConsole({ controller }: GuidedConsoleProps) {
  const {
    product,
    setProduct,
    audience,
    setAudience,
    styleKeywords,
    setStyleKeywords,
    designDirectionNote,
    setDesignDirectionNote,
    q0IntentConfidence,
    setQ0IntentConfidence,
    onboardingPhase,
    autoContinue,
    setAutoContinue,
    autoPickTop1,
    setAutoPickTop1,
    canStartSession,
    sessionId,
    sessionPayload,
    jobsPayload,
    busy,
    error,
    errorStatus,
    canRetry,
    showSignIn,
    setShowSignIn,
    currentScene,
    chatEntries,
    queuedCommands,
    shouldQueueIntervention,
    buildConfirmRequired,
    rightPanelViewModel,
    top3ModelSource,
    executeSlashCommand,
    handleStartSession,
    handleSelectCandidate,
    handleConfirmBuild,
    handleRegenerateTop3,
    handleRegenerateOutputs,
    handleExportZip,
    handleRunGuidedAction,
    handleForceQueued,
    handleDiscardQueued,
    handleRetryLastAction,
    handleSaveApiToken
  } = controller;

  const sessionReady = Boolean(sessionId);
  const stage = sessionPayload?.session.current_step ?? "interview_collect";
  const activeScene = sessionReady ? currentScene : "DEFINE";
  const activeStage = sessionReady ? stage : "interview_collect";
  const latestTop3 = sessionPayload?.latest_top3 ?? [];
  const narrativeArtifact = useMemo(() => {
    return (sessionPayload?.recent_artifacts ?? []).find((artifact) => artifact.kind === "brand_narrative") ?? null;
  }, [sessionPayload?.recent_artifacts]);
  const latestFailedJob = useMemo(() => {
    return [...(jobsPayload?.jobs ?? [])]
      .filter((job) => job.status === "failed" && Boolean(job.error))
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0];
  }, [jobsPayload?.jobs]);
  const sceneSummary: Record<typeof activeScene, string> = {
    DEFINE: "Capture the brief, lock the direction, and prime the brand narrative.",
    EXPLORE: "Review the strongest concept variants and compare their moodboard signals.",
    DECIDE: "Commit to one direction and prepare the build approval handoff.",
    PACKAGE: "Collect the output pack, export deliverables, and close the session."
  };
  const sessionMetrics = [
    { label: "Session", value: sessionPayload?.session.id ?? sessionId ?? "Pending" },
    { label: "Scene", value: activeScene },
    { label: "Step", value: stage.replaceAll("_", " ") },
    { label: "Top-3", value: String(latestTop3.length) },
    { label: "Selected", value: sessionPayload?.selected_candidate_id ?? "None" },
    { label: "Q0", value: sessionPayload?.session.intent_confidence?.toString() ?? "Unrated" }
  ];

  const pageStyle = useMemo(() => createAuroraPageStyle(), []);

  const errorPanel = error ? (
    <div className="mt-4 rounded-[22px] border border-rose-300/35 bg-rose-500/10 p-3 text-xs text-rose-100">
      <p>{error}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {canRetry ? (
          <button
            className="aurora-btn-ghost rounded-full px-3 py-1.5 text-[11px]"
            onClick={() => void handleRetryLastAction()}
          >
            Retry
          </button>
        ) : null}
        {errorStatus === 401 ? (
          <button
            className="aurora-btn-primary rounded-full px-3 py-1.5 text-[11px]"
            onClick={() => setShowSignIn(true)}
          >
            Sign-in
          </button>
        ) : null}
      </div>
    </div>
  ) : null;

  const signInModal = showSignIn ? (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/72 px-4">
      <div className="aurora-panel w-full max-w-md rounded-[28px] p-5">
        <p className="aurora-title-primary text-xl">Reconnect this session.</p>
        <p className="mt-2 text-sm text-slate-300">Re-bootstrap the anonymous Supabase session before retrying.</p>
        <div className="mt-4 flex gap-2">
          <button
            className="aurora-btn-primary rounded-full px-4 py-2 text-xs font-semibold"
            onClick={() => void handleSaveApiToken()}
          >
            Reconnect
          </button>
          <button
            className="aurora-btn-ghost rounded-full px-4 py-2 text-xs"
            onClick={() => setShowSignIn(false)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <main className="aurora-page min-h-screen px-3 py-2.5 text-slate-100 md:px-4 md:py-3" style={pageStyle}>
      <section className="mx-auto max-w-[96rem]">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.82fr)_20.75rem]">
          <div className="space-y-3">
            {!sessionReady ? (
              <article
                className={`aurora-panel aurora-onboarding-card aurora-setup-panel rounded-[32px] p-4 ${
                  onboardingPhase === "flipping" ? "is-flipping" : ""
                }`}
              >
                <div className="flex min-h-[4.75rem] flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <h2 className="aurora-title-primary text-[clamp(1.28rem,1.95vw,1.62rem)] leading-[1.08]">
                      Tell Aurora what you&apos;re building.
                    </h2>
                    <p className="mt-1.5 max-w-2xl text-[13px] text-slate-300">
                      Share the basics so Aurora can suggest the right direction from the start.
                    </p>
                  </div>
                  <span className="aurora-status-chip self-start px-3 text-[10px]">Pre-session</span>
                </div>

                <div className="aurora-console-divider mt-2.5" />

                <div className="mt-3 grid gap-3 md:auto-rows-fr md:grid-cols-2">
                  <label className="aurora-surface-soft aurora-field-shell block h-full text-sm">
                    <span className="text-slate-200">Product</span>
                    <p className="text-xs text-slate-400">What are you making?</p>
                    <input
                      className="aurora-input mt-2 w-full rounded-[18px] px-3 py-2.5 text-sm"
                      value={product}
                      onChange={(event) => setProduct(event.target.value)}
                      placeholder="e.g. AI landing page builder for solo founders"
                      disabled={onboardingPhase === "flipping"}
                    />
                  </label>

                  <label className="aurora-surface-soft aurora-field-shell block h-full text-sm">
                    <span className="text-slate-200">Audience</span>
                    <p className="text-xs text-slate-400">Who should this feel made for?</p>
                    <input
                      className="aurora-input mt-2 w-full rounded-[18px] px-3 py-2.5 text-sm"
                      value={audience}
                      onChange={(event) => setAudience(event.target.value)}
                      placeholder="e.g. solo founders shipping in public"
                      disabled={onboardingPhase === "flipping"}
                    />
                  </label>

                  <label className="aurora-surface-soft aurora-field-shell block h-full text-sm">
                    <span className="text-slate-200">Style Keywords</span>
                    <p className="text-xs text-slate-400">A few words for the visual mood.</p>
                    <input
                      className="aurora-input mt-2 w-full rounded-[18px] px-3 py-2.5 text-sm"
                      value={styleKeywords}
                      onChange={(event) => setStyleKeywords(event.target.value)}
                      placeholder="e.g. editorial, calm, ritual"
                      disabled={onboardingPhase === "flipping"}
                    />
                  </label>

                  <label className="aurora-surface-soft aurora-field-shell block h-full text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-200">Design Confidence (1-5)</span>
                      <span className="aurora-inline-help group" tabIndex={0} role="button" aria-label="Design confidence definition">
                        !
                        <span className="aurora-help-tooltip">
                          Design confidence는 본인이 원하는 디자인 무드/톤/스타일 방향을 얼마나 명확히 알고 있는지를 나타내는
                          자기평가 점수(1~5)입니다. AB_Aurora에서는 이 Q0 값을 초기 판단 기준으로 써서
                          intent_confidence와 변주 폭(wide/medium/narrow)을 정합니다.
                        </span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">How clear is the style direction right now?</p>
                    <select
                      className="aurora-input mt-2 w-full rounded-[18px] px-3 py-2.5 text-sm"
                      value={q0IntentConfidence ?? ""}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setQ0IntentConfidence(Number.isInteger(next) ? next : null);
                      }}
                      disabled={onboardingPhase === "flipping"}
                    >
                      <option value="">Select confidence score</option>
                      <option value="1">1 - no idea</option>
                      <option value="2">2 - vague hints</option>
                      <option value="3">3 - some direction</option>
                      <option value="4">4 - clear direction</option>
                      <option value="5">5 - very clear/fixed</option>
                    </select>
                  </label>

                  <label className="aurora-surface-soft aurora-field-shell block text-sm md:col-span-2">
                    <span className="text-slate-200">Design Requirement *</span>
                    <p className="text-xs text-slate-400">What must stay true in the final design?</p>
                    <textarea
                      className="aurora-input mt-2 min-h-[68px] w-full rounded-[18px] px-3 py-2.5 text-sm"
                      value={designDirectionNote}
                      onChange={(event) => setDesignDirectionNote(event.target.value)}
                      placeholder="e.g. Keep serif headline hierarchy, avoid glossy gradients, preserve dense content blocks"
                      disabled={onboardingPhase === "flipping"}
                    />
                  </label>
                </div>

                <div className="mt-2.5 grid gap-2 lg:grid-cols-[1fr_auto] lg:items-end">
                  <div className="flex flex-wrap gap-3">
                    <label className="aurora-surface-soft flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] text-slate-200">
                      <input
                        className="aurora-check"
                        type="checkbox"
                        checked={autoContinue}
                        onChange={(event) => setAutoContinue(event.target.checked)}
                        disabled={onboardingPhase === "flipping"}
                      />
                      Auto continue
                    </label>
                    <label className="aurora-surface-soft flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] text-slate-200">
                      <input
                        className="aurora-check"
                        type="checkbox"
                        checked={autoPickTop1}
                        onChange={(event) => setAutoPickTop1(event.target.checked)}
                        disabled={onboardingPhase === "flipping"}
                      />
                      Auto pick top 1
                    </label>
                  </div>
                  <p className="aurora-tip-chip rounded-full px-3.5 py-1.5 text-[11px]">
                    Queued commands apply at the next stage boundary.
                  </p>
                </div>

                <button
                  className="aurora-btn-primary aurora-btn-command mt-2.5 min-h-[2.625rem] w-full rounded-full px-5 text-sm font-semibold"
                  onClick={() => void handleStartSession()}
                  disabled={busy || !canStartSession || onboardingPhase === "flipping"}
                >
                  {onboardingPhase === "flipping" ? "Entering Workspace..." : "Start Session"}
                </button>

                {errorPanel}
              </article>
            ) : (
              <article className="aurora-panel aurora-card-shift rounded-[32px] p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="aurora-title-primary text-[clamp(1.16rem,1.7vw,1.45rem)] leading-[1.1]">
                      Your session at a glance.
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-300">
                      Keep runtime context visible while the scene canvas and command dock continue to update.
                    </p>
                  </div>
                  <span className="aurora-chip">Session Live</span>
                </div>

                <div className="aurora-console-divider mt-5" />

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {sessionMetrics.map((metric) => (
                    <div key={metric.label} className="aurora-surface-soft aurora-stat-card">
                      <p className="aurora-title-label text-[10px] tracking-[0.24em]">{metric.label}</p>
                      <span className="aurora-stat-value break-all">{metric.value}</span>
                    </div>
                  ))}
                </div>

                {latestFailedJob ? (
                  <details className="aurora-surface-soft mt-4 rounded-[22px] px-4 py-3 text-xs">
                    <summary className="cursor-pointer text-slate-200">Latest failure details ({latestFailedJob.step})</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-slate-300">
                      {latestFailedJob.error}
                    </pre>
                  </details>
                ) : null}

                {errorPanel}
              </article>
            )}

            <article className="aurora-panel aurora-card-shift aurora-canvas-panel rounded-[32px] p-4">
              <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <h1 className="aurora-display-title mt-3">How Aurora will guide this project.</h1>
                  <p className="mt-3 max-w-2xl text-sm text-slate-300">{sceneSummary[activeScene]}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="aurora-status-pill rounded-full px-4 py-2.5">
                    <p className="aurora-title-label text-[10px] tracking-[0.22em]">Current Scene</p>
                    <p className="aurora-title-primary mt-1 text-lg leading-none">{activeScene}</p>
                  </div>
                  <span className={sessionReady ? "aurora-chip" : "aurora-chip-soft"}>
                    {sessionReady ? stage.replaceAll("_", " ") : "Awaiting session"}
                  </span>
                </div>
              </header>

              <div className="mt-5">
                <Progress4 scene={activeScene} />
              </div>

              <div className="aurora-console-divider mt-5" />

              <div className="mt-5">
                <SceneRouter scene={activeScene} stage={activeStage}>
                  {activeScene === "DEFINE" ? (
                    <DefineScene
                      stage={activeStage}
                      narrative={(narrativeArtifact?.content as Record<string, unknown> | undefined) ?? null}
                    />
                  ) : null}

                  {sessionReady && currentScene === "EXPLORE" ? (
                    <ExploreScene
                      candidates={latestTop3}
                      selectedCandidateId={sessionPayload?.selected_candidate_id ?? null}
                      modelSource={top3ModelSource}
                      busy={busy}
                      onSelect={(candidateId) => void handleSelectCandidate(candidateId)}
                      onConfirmBuild={() => void handleConfirmBuild()}
                    />
                  ) : null}

                  {sessionReady && currentScene === "DECIDE" ? (
                    <DecideScene
                      candidates={latestTop3}
                      selectedCandidateId={sessionPayload?.selected_candidate_id ?? null}
                      modelSource={top3ModelSource}
                      busy={busy}
                      buildRequired={buildConfirmRequired}
                      onSelect={(candidateId) => void handleSelectCandidate(candidateId)}
                      onConfirmBuild={() => void handleConfirmBuild()}
                    />
                  ) : null}

                  {sessionReady && currentScene === "PACKAGE" ? (
                    <PackageScene
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
          </div>

          <aside className="h-fit xl:sticky xl:top-4">
            <ChatDock
              entries={chatEntries}
              artifacts={sessionPayload?.recent_artifacts ?? []}
              jobs={jobsPayload?.jobs ?? []}
              queuedCommands={queuedCommands}
              shouldQueueIntervention={shouldQueueIntervention}
              busy={busy}
              sessionReady={sessionReady}
              guided
              defaultTab="chat"
              showArtifactsTab={sessionReady && currentScene === "PACKAGE"}
              status={sessionReady ? rightPanelViewModel.status : "idle"}
              modelSource={rightPanelViewModel.modelSource}
              actionHub={rightPanelViewModel}
              onRunGuidedAction={(actionId) => void handleRunGuidedAction(actionId)}
              onExecuteSlash={(raw) => executeSlashCommand(raw)}
              onForceQueued={(queueId) => void handleForceQueued(queueId)}
              onDiscardQueued={handleDiscardQueued}
            />
          </aside>
        </div>
      </section>

      {signInModal}
    </main>
  );
}
