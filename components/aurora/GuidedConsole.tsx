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
    tokenDraft,
    setTokenDraft,
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

  const pageStyle = useMemo(() => createAuroraPageStyle(), []);

  const errorPanel = error ? (
    <div className="mt-4 rounded-xl border border-rose-300/35 bg-rose-500/10 p-3 text-xs text-rose-100">
      <p>{error}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {canRetry ? (
          <button
            className="aurora-btn-ghost rounded-md px-2 py-1 text-[11px]"
            onClick={() => void handleRetryLastAction()}
          >
            Retry
          </button>
        ) : null}
        {errorStatus === 401 ? (
          <button
            className="aurora-btn-primary rounded-md px-2 py-1 text-[11px]"
            onClick={() => setShowSignIn(true)}
          >
            Sign-in
          </button>
        ) : null}
      </div>
    </div>
  ) : null;

  const signInModal = showSignIn ? (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 px-4">
      <div className="aurora-panel w-full max-w-md rounded-2xl p-4">
        <p className="aurora-title-primary text-sm font-semibold">API Sign-in</p>
        <p className="mt-1 text-xs text-slate-300">Set x-api-token for protected routes.</p>
        <input
          className="aurora-input mt-3 w-full rounded-lg px-3 py-2 text-sm"
          value={tokenDraft}
          onChange={(event) => setTokenDraft(event.target.value)}
          placeholder="x-api-token"
        />
        <div className="mt-3 flex gap-2">
          <button
            className="aurora-btn-primary rounded-lg px-3 py-2 text-xs font-semibold"
            onClick={handleSaveApiToken}
          >
            Save
          </button>
          <button
            className="aurora-btn-ghost rounded-lg px-3 py-2 text-xs"
            onClick={() => setShowSignIn(false)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <main className="aurora-page min-h-screen px-4 py-6 text-slate-100 md:px-6" style={pageStyle}>
      <section className="mx-auto grid max-w-[92rem] gap-4 xl:grid-cols-[1.72fr_1fr]">
        <div className="space-y-4">
          {!sessionReady ? (
            <article
              className={`aurora-panel aurora-onboarding-card aurora-setup-panel rounded-2xl p-5 ${
                onboardingPhase === "flipping" ? "is-flipping" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="aurora-title-label text-xs uppercase tracking-[0.3em]">SETUP</p>
                <span className="rounded-full border border-indigo-200/35 bg-indigo-400/12 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-indigo-100">
                  PRE-SESSION
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="text-slate-200">Product</span>
                  <input
                    className="aurora-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm"
                    value={product}
                    onChange={(event) => setProduct(event.target.value)}
                    placeholder="e.g. AI landing page builder for solo founders"
                    disabled={onboardingPhase === "flipping"}
                  />
                </label>

                <label className="block text-sm">
                  <span className="text-slate-200">Audience</span>
                  <input
                    className="aurora-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm"
                    value={audience}
                    onChange={(event) => setAudience(event.target.value)}
                    placeholder="e.g. solo founders shipping in public"
                    disabled={onboardingPhase === "flipping"}
                  />
                </label>

                <label className="block text-sm">
                  <span className="text-slate-200">Style Keywords</span>
                  <input
                    className="aurora-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm"
                    value={styleKeywords}
                    onChange={(event) => setStyleKeywords(event.target.value)}
                    placeholder="e.g. editorial, calm, ritual"
                    disabled={onboardingPhase === "flipping"}
                  />
                </label>

                <label className="block text-sm">
                  <span className="text-slate-200">Design Requirement *</span>
                  <textarea
                    className="aurora-input mt-1.5 min-h-[84px] w-full rounded-lg px-3 py-2.5 text-sm"
                    value={designDirectionNote}
                    onChange={(event) => setDesignDirectionNote(event.target.value)}
                    placeholder="e.g. Keep serif headline hierarchy, avoid glossy gradients, preserve dense content blocks"
                    disabled={onboardingPhase === "flipping"}
                  />
                </label>

                <div className="aurora-surface-soft rounded-xl px-3 py-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-100">Q0 Design Confidence (1-5)</p>
                    <span className="aurora-inline-help group" tabIndex={0} role="button" aria-label="Design confidence definition">
                      !
                      <span className="aurora-help-tooltip">
                        Design confidence는 본인이 원하는 디자인 무드/톤/스타일 방향을 얼마나 명확히 알고 있는지를 나타내는
                        자기평가 점수(1~5)입니다. AB_Aurora에서는 이 Q0 값을 초기 판단 기준으로 써서 intent_confidence와
                        변주 폭(wide/medium/narrow)을 정합니다.
                      </span>
                    </span>
                  </div>
                  <div className="mt-2">
                    <select
                      className="aurora-input w-full rounded-lg px-3 py-2 text-sm"
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
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    className="aurora-check"
                    type="checkbox"
                    checked={autoContinue}
                    onChange={(event) => setAutoContinue(event.target.checked)}
                    disabled={onboardingPhase === "flipping"}
                  />
                  Auto continue
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-200">
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

              <p className="aurora-tip-chip mt-4 rounded-lg px-3 py-2 text-xs">
                Tip: queued commands are applied safely at the next stage boundary.
              </p>

              <button
                className="aurora-btn-primary aurora-btn-command mt-3 w-full rounded-lg px-3 py-2.5 text-base font-semibold"
                onClick={() => void handleStartSession()}
                disabled={busy || !canStartSession || onboardingPhase === "flipping"}
              >
                {onboardingPhase === "flipping" ? "Entering Workspace..." : "Start Session"}
              </button>

              {errorPanel}
            </article>
          ) : (
            <article className="aurora-panel aurora-card-shift rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <p className="aurora-title-label text-xs uppercase tracking-[0.24em]">Session Status</p>
              </div>

              <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
                <p>Session: {sessionPayload?.session.id ?? sessionId}</p>
                <p>Scene: {currentScene}</p>
                <p>Step: {stage}</p>
                <p>Top-3: {latestTop3.length}</p>
                <p>Selected: {sessionPayload?.selected_candidate_id ?? "none"}</p>
                <p>Q0: {sessionPayload?.session.intent_confidence ?? "n/a"}</p>
              </div>

              {latestFailedJob ? (
                <details className="aurora-surface-soft mt-3 rounded-lg px-3 py-2 text-xs">
                  <summary className="cursor-pointer text-slate-200">Latest failure details ({latestFailedJob.step})</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-slate-300">
                    {latestFailedJob.error}
                  </pre>
                </details>
              ) : null}

              {errorPanel}
            </article>
          )}

          <article className="aurora-panel aurora-card-shift aurora-canvas-panel rounded-2xl p-5">
            <header className="mb-4">
              <div>
                <p className="aurora-title-label text-xs uppercase tracking-[0.24em]">Scene Canvas</p>
                <h1 className="aurora-title-primary text-2xl font-semibold">Aurora Guided Flow.</h1>
              </div>
            </header>

            <Progress4 scene={activeScene} />

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

        <aside className="h-fit xl:sticky xl:top-6">
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
            onExecuteSlash={(raw) => executeSlashCommand(raw)}
            onForceQueued={(queueId) => void handleForceQueued(queueId)}
            onDiscardQueued={handleDiscardQueued}
          />
        </aside>
      </section>

      {signInModal}
    </main>
  );
}
