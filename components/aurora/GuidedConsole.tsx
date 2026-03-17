"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createAuroraPageStyle } from "./aurora-assets";
import { ChatDock } from "./ChatDock";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { Progress4 } from "./Progress4";
import { SceneRouter } from "./SceneRouter";
import { DecideScene } from "./scenes/DecideScene";
import { DefineScene } from "./scenes/DefineScene";
import { ExploreScene } from "./scenes/ExploreScene";
import { PackageScene } from "./scenes/PackageScene";
import type { useAuroraController } from "./useAuroraController";
import type { DirectionRecord, ImagePreviewPayload } from "./types";

type AuroraController = ReturnType<typeof useAuroraController>;

type GuidedConsoleProps = {
  controller: AuroraController;
};

function clampDockWidth(width: number, viewportWidth: number): number {
  const minimum = viewportWidth >= 1440 ? 500 : 440;
  const maximum = Math.max(minimum, Math.min(760, viewportWidth - 520));
  return Math.min(Math.max(width, minimum), maximum);
}

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
    latestFailedJob,
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
    handleUpdateDefineBrief,
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
  const usageSummary = sessionPayload?.usage_summary ?? null;
  const latestTop3 = sessionPayload?.latest_top3 ?? [];
  const narrativeArtifact = useMemo(() => {
    return (sessionPayload?.recent_artifacts ?? []).find((artifact) => artifact.kind === "brand_narrative") ?? null;
  }, [sessionPayload?.recent_artifacts]);
  const directionSnapshot = useMemo<DirectionRecord | null>(() => {
    const artifactContent = narrativeArtifact?.content;
    if (artifactContent && typeof artifactContent.direction === "object" && artifactContent.direction) {
      return artifactContent.direction as DirectionRecord;
    }
    return sessionPayload?.session.draft_spec?.direction ?? null;
  }, [narrativeArtifact?.content, sessionPayload?.session.draft_spec?.direction]);
  const defineDirectionClarity = directionSnapshot?.clarity ?? null;
  const defineReadyForConcepts = defineDirectionClarity?.ready_for_concepts !== false;
  const sceneSummary: Record<typeof activeScene, string> = {
    DEFINE: "Review the synthesized direction, steer the first asset bundle focus, and hold before concept generation.",
    EXPLORE: "Compare the three story-and-asset bundles and decide which route is worth taking forward.",
    DECIDE: "Lock the chosen bundle, inspect the tradeoffs, and approve the build path.",
    PACKAGE: "Review the deliverables and export the strategy-plus-assets pack."
  };
  const sceneCanvasTitle: Record<typeof activeScene, string> = {
    DEFINE: "Shape the direction",
    EXPLORE: "Compare the bundles",
    DECIDE: "Choose the route",
    PACKAGE: "Export the pack"
  };
  const sessionMetrics = [
    { label: "Session", value: sessionPayload?.session.id ?? sessionId ?? "Pending" },
    { label: "Scene", value: activeScene },
    { label: "Step", value: stage.replaceAll("_", " ") },
    { label: "Top-3", value: String(latestTop3.length) },
    { label: "Selected", value: sessionPayload?.selected_candidate_id ?? "None" },
    { label: "Q0", value: sessionPayload?.session.intent_confidence?.toString() ?? "Unrated" }
  ];
  const summaryPills = [
    { label: "Scene", value: activeScene },
    { label: "Step", value: stage.replaceAll("_", " ") },
    { label: "Concepts", value: String(latestTop3.length) },
    { label: "Selected", value: sessionPayload?.selected_candidate_id ? "Locked" : "Open" },
    { label: "Model", value: top3ModelSource },
    {
      label: "Usage",
      value: `${(usageSummary?.by_type?.openai_tokens_total ?? 0).toLocaleString()} tok`
    }
  ];
  const showSummaryActions = sessionReady && activeScene !== "DEFINE";

  const pageStyle = useMemo(() => createAuroraPageStyle(), []);
  const [sessionOverviewOpen, setSessionOverviewOpen] = useState(false);
  const [dockWidth, setDockWidth] = useState(() => {
    if (typeof window === "undefined") {
      return 700;
    }
    const storedWidth = window.localStorage.getItem("aurora:dock-width");
    const parsed = Number(storedWidth);
    return Number.isFinite(parsed) ? clampDockWidth(parsed, window.innerWidth) : clampDockWidth(700, window.innerWidth);
  });
  const [isResizingDock, setIsResizingDock] = useState(false);
  const [defineWaitOverride, setDefineWaitOverride] = useState(false);
  const [defineAutoDeadline, setDefineAutoDeadline] = useState<number | null>(null);
  const [defineAutoRemainingSeconds, setDefineAutoRemainingSeconds] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<ImagePreviewPayload | null>(null);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncWidth = () => {
      setDockWidth((current) => clampDockWidth(current, window.innerWidth));
    };

    syncWidth();
    window.addEventListener("resize", syncWidth);
    return () => window.removeEventListener("resize", syncWidth);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("aurora:dock-width", String(dockWidth));
  }, [dockWidth]);

  useEffect(() => {
    if (!isResizingDock || typeof window === "undefined") {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeStateRef.current) {
        return;
      }
      const delta = resizeStateRef.current.startX - event.clientX;
      setDockWidth(clampDockWidth(resizeStateRef.current.startWidth + delta, window.innerWidth));
    };

    const handlePointerUp = () => {
      resizeStateRef.current = null;
      setIsResizingDock(false);
    };

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingDock]);

  const handleDockResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (typeof window === "undefined" || window.innerWidth < 1280) {
        return;
      }
      event.preventDefault();
      resizeStateRef.current = {
        startX: event.clientX,
        startWidth: dockWidth
      };
      setIsResizingDock(true);
    },
    [dockWidth]
  );

  const workspaceStyle = useMemo(() => {
    if (!sessionReady) {
      return undefined;
    }
    return {
      "--aurora-dock-width": `${dockWidth}px`
    } as CSSProperties;
  }, [dockWidth, sessionReady]);

  const defineAutoEligible =
    sessionReady &&
    activeScene === "DEFINE" &&
    activeStage === "brand_narrative" &&
    sessionPayload?.session.status === "wait_user" &&
    Boolean(directionSnapshot) &&
    defineReadyForConcepts;

  useEffect(() => {
    if (!defineAutoEligible) {
      const resetTimer = window.setTimeout(() => {
        setDefineWaitOverride(false);
        setDefineAutoDeadline(null);
        setDefineAutoRemainingSeconds(null);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    if (!autoContinue || defineWaitOverride) {
      const pauseTimer = window.setTimeout(() => {
        setDefineAutoDeadline(null);
        setDefineAutoRemainingSeconds(null);
      }, 0);
      return () => window.clearTimeout(pauseTimer);
    }

    const startTimer = window.setTimeout(() => {
      setDefineAutoDeadline((current) => current ?? Date.now() + 60_000);
    }, 0);
    return () => window.clearTimeout(startTimer);
  }, [activeStage, autoContinue, defineAutoEligible, defineWaitOverride, sessionReady]);

  useEffect(() => {
    if (!defineAutoEligible || !autoContinue || defineWaitOverride || defineAutoDeadline === null) {
      return;
    }

    const syncCountdown = () => {
      const remainingMs = defineAutoDeadline - Date.now();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setDefineAutoRemainingSeconds(remainingSeconds);

      if (remainingMs <= 0) {
        setDefineAutoDeadline(null);
        if (!busy) {
          void handleRunGuidedAction("run_step");
        }
      }
    };

    syncCountdown();
    const timer = window.setInterval(syncCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [autoContinue, busy, defineAutoDeadline, defineAutoEligible, defineWaitOverride, handleRunGuidedAction]);

  const handlePauseDefineAutoAdvance = useCallback(() => {
    setDefineWaitOverride(true);
    setDefineAutoDeadline(null);
    setDefineAutoRemainingSeconds(null);
  }, []);

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
    <main className="aurora-page min-h-screen px-2.5 py-2 text-slate-100 md:px-3.5 md:py-2.5" style={pageStyle}>
      <section className="mx-auto max-w-[98rem] space-y-2">
        {sessionReady ? (
          <article className="aurora-panel aurora-session-overview rounded-[28px] px-3 py-2">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-1.5">
                  {summaryPills.map((metric) => (
                    <span key={metric.label} className="aurora-session-pill">
                      <span className="aurora-title-label text-[9px] tracking-[0.2em]">{metric.label}</span>
                      <strong>{metric.value}</strong>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {showSummaryActions && rightPanelViewModel.primaryAction ? (
                  <button
                    className="aurora-btn-cta rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    onClick={() => void handleRunGuidedAction(rightPanelViewModel.primaryAction!.id)}
                    disabled={
                      busy ||
                      rightPanelViewModel.primaryAction.disabled ||
                      !rightPanelViewModel.primaryAction
                    }
                    title={rightPanelViewModel.primaryAction.disabledReason}
                  >
                    {rightPanelViewModel.primaryAction.label}
                  </button>
                ) : null}
                {showSummaryActions && rightPanelViewModel.secondaryAction ? (
                  <button
                    className="aurora-btn-secondary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    onClick={() => void handleRunGuidedAction(rightPanelViewModel.secondaryAction!.id)}
                    disabled={
                      busy ||
                      rightPanelViewModel.secondaryAction.disabled ||
                      !rightPanelViewModel.secondaryAction
                    }
                    title={rightPanelViewModel.secondaryAction.disabledReason}
                  >
                    {rightPanelViewModel.secondaryAction.label}
                  </button>
                ) : null}
                <button
                  className="aurora-chip-soft shrink-0 px-3 text-[10px]"
                  onClick={() => setSessionOverviewOpen((current) => !current)}
                  type="button"
                  aria-expanded={sessionOverviewOpen}
                >
                  {sessionOverviewOpen ? "Hide details" : "Show details"}
                </button>
              </div>
            </div>

            {sessionOverviewOpen ? (
              <>
                <div className="aurora-console-divider mt-3" />

                <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="aurora-surface-soft rounded-[22px] px-4 py-3 sm:col-span-2 xl:col-span-3">
                      <p className="aurora-title-label text-[10px] tracking-[0.22em]">Scene Focus</p>
                      <p className="mt-2 text-sm text-slate-200">{sceneSummary[activeScene]}</p>
                    </div>
                    {sessionMetrics.map((metric) => (
                      <div key={metric.label} className="aurora-surface-soft aurora-stat-card">
                        <p className="aurora-title-label text-[10px] tracking-[0.24em]">{metric.label}</p>
                        <span className="aurora-stat-value break-all">{metric.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="aurora-surface-soft rounded-[22px] px-4 py-3">
                      <p className="aurora-title-label text-[10px] tracking-[0.22em]">Suggested Command</p>
                      <p className="aurora-command-chip mt-2 rounded-[16px] px-3 py-2 text-sm font-semibold text-indigo-50">
                        {rightPanelViewModel.suggestedCommand}
                      </p>
                      <p className="mt-2 text-[12px] leading-5 text-slate-300">{rightPanelViewModel.suggestedReason}</p>
                    </div>

                    <div className="aurora-surface-soft rounded-[22px] px-4 py-3">
                      <p className="aurora-title-label text-[10px] tracking-[0.22em]">Flow Usage</p>
                      <p className="mt-2 text-sm text-slate-100">
                        {(usageSummary?.by_type?.openai_tokens_total ?? 0).toLocaleString()} tokens
                      </p>
                      <p className="mt-1 text-[12px] text-slate-300">
                        {(usageSummary?.by_type?.openai_text_requests ?? 0).toLocaleString()} text calls ·{" "}
                        {(usageSummary?.by_type?.openai_image_generations ?? 0).toLocaleString()} images
                      </p>
                    </div>
                  </div>
                </div>

                {latestFailedJob ? (
                  <details className="aurora-surface-soft mt-3 rounded-[22px] px-4 py-3 text-xs">
                    <summary className="cursor-pointer text-slate-200">Latest failure details ({latestFailedJob.step})</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-slate-300">
                      {latestFailedJob.error}
                    </pre>
                  </details>
                ) : null}
              </>
            ) : null}
          </article>
        ) : null}

        <div className={`aurora-workspace-shell ${sessionReady ? "is-session" : "is-setup"}`} style={workspaceStyle}>
          <div className={`min-w-0 space-y-2 ${sessionReady ? "min-h-0" : ""}`}>
            {!sessionReady ? (
              <article
                className={`aurora-panel aurora-onboarding-card aurora-setup-panel rounded-[32px] p-3.5 md:p-4 ${
                  onboardingPhase === "flipping" ? "is-flipping" : ""
                }`}
              >
                <div className="flex min-h-[4.75rem] flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <h2 className="aurora-title-primary text-[clamp(1.2rem,1.82vw,1.5rem)] leading-[1.08]">
                      Tell Aurora what you&apos;re building.
                    </h2>
                    <p className="mt-1 max-w-2xl text-[12px] text-slate-300">
                      Share the basics so Aurora can suggest the right direction from the start.
                    </p>
                  </div>
                  <span className="aurora-status-chip self-start px-3 text-[10px]">Pre-session</span>
                </div>

                <div className="aurora-console-divider mt-2.5" />

                <div className="mt-2.5 grid gap-2.5 md:grid-cols-2">
                  <label className="aurora-surface-soft aurora-field-shell block text-sm">
                    <span className="text-slate-200">Product</span>
                    <p className="text-xs text-slate-400">What are you making?</p>
                    <input
                      className="aurora-input mt-1.5 w-full rounded-[18px] px-3 py-2.5 text-sm"
                      value={product}
                      onChange={(event) => setProduct(event.target.value)}
                      placeholder="e.g. AI landing page builder for solo founders"
                      disabled={onboardingPhase === "flipping"}
                    />
                  </label>

                  <label className="aurora-surface-soft aurora-field-shell block text-sm">
                    <span className="text-slate-200">Audience</span>
                    <p className="text-xs text-slate-400">Who should this feel made for?</p>
                    <input
                      className="aurora-input mt-1.5 w-full rounded-[18px] px-3 py-2.5 text-sm"
                      value={audience}
                      onChange={(event) => setAudience(event.target.value)}
                      placeholder="e.g. solo founders shipping in public"
                      disabled={onboardingPhase === "flipping"}
                    />
                  </label>

                  <label className="aurora-surface-soft aurora-field-shell block text-sm">
                    <span className="text-slate-200">Style Keywords</span>
                    <p className="text-xs text-slate-400">A few words for the visual mood.</p>
                    <input
                      className="aurora-input mt-1.5 w-full rounded-[18px] px-3 py-2.5 text-sm"
                      value={styleKeywords}
                      onChange={(event) => setStyleKeywords(event.target.value)}
                      placeholder="e.g. editorial, calm, ritual"
                      disabled={onboardingPhase === "flipping"}
                    />
                  </label>

                  <label className="aurora-surface-soft aurora-field-shell block text-sm">
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
                      className="aurora-input mt-1.5 w-full rounded-[18px] px-3 py-2.5 text-sm"
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
                      className="aurora-input mt-1.5 min-h-[60px] w-full rounded-[18px] px-3 py-2.5 text-sm"
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
            ) : null}

            {sessionReady ? errorPanel : null}

            <article
              className={`aurora-panel aurora-card-shift aurora-canvas-panel rounded-[32px] p-3.5 ${
                sessionReady ? "min-h-0 xl:flex xl:h-[calc(100dvh-8rem)] xl:flex-col xl:overflow-hidden" : ""
              }`}
            >
              <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="aurora-title-label text-[10px] tracking-[0.22em]">Current Workspace</p>
                  <h1 className="aurora-display-title mt-2">{sceneCanvasTitle[activeScene]}</h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-300">{sceneSummary[activeScene]}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className={sessionReady ? "aurora-chip" : "aurora-chip-soft"}>
                    {sessionReady ? stage.replaceAll("_", " ") : "Awaiting session"}
                  </span>
                </div>
              </header>

              <div className="mt-5">
                <Progress4 scene={activeScene} />
              </div>

              <div className="aurora-console-divider mt-5" />

              <div className={`mt-5 ${sessionReady ? "min-h-0 flex-1 overflow-hidden" : ""}`}>
                <div className={sessionReady ? "h-full overflow-auto pr-1" : ""}>
                  <SceneRouter scene={activeScene} stage={activeStage}>
                    {activeScene === "DEFINE" ? (
                      <DefineScene
                        stage={activeStage}
                        direction={directionSnapshot as DirectionRecord | null}
                        brief={{
                          product: sessionPayload?.session.product ?? "",
                          audience: sessionPayload?.session.audience ?? "",
                          styleKeywords: sessionPayload?.session.style_keywords ?? [],
                          constraint: sessionPayload?.session.constraint ?? null,
                          q0IntentConfidence: sessionPayload?.session.intent_confidence ?? null
                        }}
                        onUpdateBrief={(input) => void handleUpdateDefineBrief(input)}
                        busy={busy}
                        autoAdvance={
                          defineAutoEligible
                            ? {
                                enabled: autoContinue,
                                waiting: defineWaitOverride,
                                secondsRemaining: defineAutoRemainingSeconds,
                                onGenerate: () => void handleRunGuidedAction("run_step"),
                                onWait: handlePauseDefineAutoAdvance
                              }
                            : null
                        }
                      />
                    ) : null}

                    {sessionReady && currentScene === "EXPLORE" ? (
                      <ExploreScene
                        candidates={latestTop3}
                        selectedCandidateId={sessionPayload?.selected_candidate_id ?? null}
                        modelSource={top3ModelSource}
                        busy={busy}
                        onPreviewImage={setPreviewImage}
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
                        onPreviewImage={setPreviewImage}
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
              </div>
            </article>
          </div>

          {sessionReady ? (
            <button
              type="button"
              className={`aurora-dock-resizer ${isResizingDock ? "is-active" : ""}`}
              aria-label="Resize chat panel"
              onPointerDown={handleDockResizeStart}
            >
              <span />
            </button>
          ) : null}

          <aside className={sessionReady ? "aurora-dock-aside h-fit xl:sticky xl:top-2" : "aurora-dock-aside h-fit"}>
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
              usageSummary={sessionPayload?.usage_summary ?? null}
              actionHub={sessionReady ? null : rightPanelViewModel}
              onRunGuidedAction={(actionId) => void handleRunGuidedAction(actionId)}
              onExecuteSlash={(raw) => executeSlashCommand(raw)}
              onForceQueued={(queueId) => void handleForceQueued(queueId)}
              onDiscardQueued={handleDiscardQueued}
            />
          </aside>
        </div>
      </section>

      {signInModal}
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </main>
  );
}
