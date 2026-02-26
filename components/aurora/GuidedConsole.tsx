"use client";

import { useMemo } from "react";
import { AURORA_ASSETS, createAuroraPageStyle } from "./aurora-assets";
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

  const stage = sessionPayload?.session.current_step ?? "interview_collect";
  const latestTop3 = sessionPayload?.latest_top3 ?? [];
  const latestFailedJob = useMemo(() => {
    return [...(jobsPayload?.jobs ?? [])]
      .filter((job) => job.status === "failed" && Boolean(job.error))
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0];
  }, [jobsPayload?.jobs]);

  const pageStyle = useMemo(() => createAuroraPageStyle(), []);

  return (
    <main className="aurora-page min-h-screen px-4 py-6 text-slate-100 md:px-6" style={pageStyle}>
      <section className="mx-auto grid max-w-[90rem] gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-4">
          <article className="aurora-panel aurora-card-shift rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <p className="aurora-title-label text-xs uppercase tracking-[0.24em]">
                {sessionId ? "Session Status" : "Setup"}
              </p>
            </div>

            {!sessionId ? (
              <div className="mt-4 space-y-3">
                <p className="aurora-title-label text-[11px] uppercase tracking-[0.2em]">Core Brief</p>

                <label className="block text-sm">
                  <span className="text-slate-300">Product</span>
                  <input
                    className="aurora-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                    value={product}
                    onChange={(event) => setProduct(event.target.value)}
                    placeholder="e.g. AI landing page builder for solo founders"
                  />
                </label>

                <label className="block text-sm">
                  <span className="text-slate-300">Audience</span>
                  <input
                    className="aurora-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                    value={audience}
                    onChange={(event) => setAudience(event.target.value)}
                    placeholder="e.g. early-stage builders shipping in public"
                  />
                </label>

                <label className="block text-sm">
                  <span className="text-slate-300">Style keywords</span>
                  <input
                    className="aurora-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                    value={styleKeywords}
                    onChange={(event) => setStyleKeywords(event.target.value)}
                    placeholder="e.g. editorial, calm, ritual"
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

                <p className="aurora-surface-soft rounded-lg px-3 py-2 text-[11px] text-slate-300">
                  실행 버튼은 우측 Chat Dock의 Next Action에서만 노출됩니다.
                </p>

                <button
                  className="aurora-btn-primary w-full rounded-lg px-3 py-2 text-sm font-semibold"
                  onClick={() => void handleStartSession()}
                  disabled={busy || !canStartSession}
                >
                  Start Session
                </button>
                <p className="text-[11px] text-slate-400">또는 Chat Dock에서 `/start`를 입력할 수 있습니다.</p>

                <div className="aurora-surface-soft rounded-lg px-3 py-2 text-[11px] text-slate-300">
                  <p className="aurora-title-label mb-2 uppercase tracking-[0.2em]">Guided Flow</p>
                  <p>1) DEFINE: `/start` 후 `/run`</p>
                  <p>2) EXPLORE: `/run`으로 Top-3 생성</p>
                  <p>3) DECIDE: `/pick 1|2|3` 후 필요 시 `/build`</p>
                  <p>4) PACKAGE: `/export`로 패키지 완료</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
                <p>Session: {sessionPayload?.session.id ?? sessionId}</p>
                <p>Scene: {currentScene}</p>
                <p>Step: {stage}</p>
                <p>Top-3: {latestTop3.length}</p>
                <p>Selected: {sessionPayload?.selected_candidate_id ?? "none"}</p>
              </div>
            )}

            {latestFailedJob ? (
              <details className="aurora-surface-soft mt-3 rounded-lg px-3 py-2 text-xs">
                <summary className="cursor-pointer text-slate-200">Latest failure details ({latestFailedJob.step})</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-slate-300">
                  {latestFailedJob.error}
                </pre>
              </details>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-lg border border-rose-300/35 bg-rose-500/10 p-3 text-xs text-rose-100">
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
            ) : null}

          </article>

          <article className="aurora-panel aurora-card-shift rounded-2xl p-5">
            <header className="mb-4">
              <div>
                <p className="aurora-title-label text-xs uppercase tracking-[0.24em]">Scene Canvas</p>
                <h1 className="aurora-title-primary text-2xl font-semibold">Aurora Guided Flow</h1>
              </div>
            </header>

            <Progress4 scene={currentScene} />

            <div className="mt-5">
              <SceneRouter scene={currentScene} stage={stage}>
                {!sessionId ? (
                  <div className="aurora-panel overflow-hidden rounded-2xl">
                    <div
                      className="h-52 bg-cover bg-center"
                      style={{
                        backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.24), rgba(2,6,23,0.85)), url(${AURORA_ASSETS.heroDesktop})`
                      }}
                    />
                    <div className="space-y-2 p-4">
                      <p className="aurora-title-label text-xs uppercase tracking-[0.2em]">Define</p>
                      <p className="text-sm text-slate-200">
                        브리프를 작성한 뒤 우측 Chat Dock에서 `/start` 명령으로 세션을 시작하세요.
                      </p>
                    </div>
                  </div>
                ) : null}

                {sessionId && currentScene === "DEFINE" ? <DefineScene stage={stage} /> : null}

                {sessionId && currentScene === "EXPLORE" ? (
                  <ExploreScene
                    candidates={latestTop3}
                    selectedCandidateId={sessionPayload?.selected_candidate_id ?? null}
                    modelSource={top3ModelSource}
                    busy={busy}
                    onSelect={(candidateId) => void handleSelectCandidate(candidateId)}
                    onConfirmBuild={() => void handleConfirmBuild()}
                  />
                ) : null}

                {sessionId && currentScene === "DECIDE" ? (
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

                {sessionId && currentScene === "PACKAGE" ? (
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
            sessionReady={Boolean(sessionId)}
            guided
            defaultTab="chat"
            showArtifactsTab={currentScene === "PACKAGE"}
            status={rightPanelViewModel.status}
            modelSource={rightPanelViewModel.modelSource}
            actionHub={rightPanelViewModel}
            onExecuteSlash={(raw) => executeSlashCommand(raw)}
            onForceQueued={(queueId) => void handleForceQueued(queueId)}
            onDiscardQueued={handleDiscardQueued}
          />
        </aside>
      </section>

      {showSignIn ? (
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
      ) : null}
    </main>
  );
}
