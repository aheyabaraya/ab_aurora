"use client";

import { useEffect, useState } from "react";
import { AURORA_ASSETS } from "../aurora-assets";
import type { DirectionRecord } from "../types";

type DefineSceneProps = {
  stage: string;
  direction?: DirectionRecord | null;
  brief?: {
    product: string;
    audience: string;
    firstDeliverable?: string | null;
    styleKeywords: string[];
    constraint?: string | null;
    q0IntentConfidence?: number | null;
  } | null;
  onUpdateBrief?: (input: {
    product: string;
    audience: string;
    firstDeliverable: string;
    styleKeywords: string[];
    constraint: string;
    q0IntentConfidence: number | null;
  }) => void;
  busy?: boolean;
  autoAdvance?: {
    enabled: boolean;
    waiting: boolean;
    secondsRemaining: number | null;
    onGenerate?: () => void;
    onWait?: () => void;
    onResume?: () => void;
  } | null;
};

type BriefCard = {
  label: string;
  value: string;
};

type DefineFocusPanelId = "snapshot" | "mechanics" | "supporting" | "prompt";

function stageSummary(stage: string): string {
  if (stage === "interview_collect" || stage === "intent_gate") {
    return "Aurora is normalizing the brief and checking whether the starting signal is strong enough.";
  }
  if (stage === "spec_draft") {
    return "The internal spec draft is being assembled from the brief.";
  }
  if (stage === "brand_narrative") {
    return "This is the working direction Aurora will use before generating concept candidates.";
  }
  return "Direction is ready and Aurora can move into concept generation.";
}

function renderTagList(items: string[]) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200">
          {item}
        </span>
      ))}
    </div>
  );
}

type DefineBriefEditorProps = {
  brief: DefineSceneProps["brief"];
  busy: boolean;
  onUpdateBrief?: DefineSceneProps["onUpdateBrief"];
};

function DefineBriefEditor({ brief, busy, onUpdateBrief }: DefineBriefEditorProps) {
  const [productDraft, setProductDraft] = useState(brief?.product ?? "");
  const [audienceDraft, setAudienceDraft] = useState(brief?.audience ?? "");
  const [firstDeliverableDraft, setFirstDeliverableDraft] = useState(brief?.firstDeliverable ?? "");
  const [styleDraft, setStyleDraft] = useState(brief?.styleKeywords.join(", ") ?? "");
  const [constraintDraft, setConstraintDraft] = useState(brief?.constraint ?? "");
  const [q0Draft, setQ0Draft] = useState<string>(brief?.q0IntentConfidence ? String(brief.q0IntentConfidence) : "3");

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-2 md:col-span-2">
        <span className="aurora-title-label">Product</span>
        <input
          className="w-full rounded-[18px] border border-white/14 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-200/45"
          value={productDraft}
          onChange={(event) => setProductDraft(event.target.value)}
          placeholder="What exactly are you building?"
        />
      </label>
      <label className="space-y-2">
        <span className="aurora-title-label">Audience</span>
        <input
          className="w-full rounded-[18px] border border-white/14 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-200/45"
          value={audienceDraft}
          onChange={(event) => setAudienceDraft(event.target.value)}
          placeholder="Who is this for first?"
        />
      </label>
      <label className="space-y-2">
        <span className="aurora-title-label">First Deliverable</span>
        <input
          className="w-full rounded-[18px] border border-white/14 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-200/45"
          value={firstDeliverableDraft}
          onChange={(event) => setFirstDeliverableDraft(event.target.value)}
          placeholder="landing hero, social post, poster, product visual"
        />
      </label>
      <label className="space-y-2">
        <span className="aurora-title-label">Q0 Confidence</span>
        <select
          className="w-full rounded-[18px] border border-white/14 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-200/45"
          value={q0Draft}
          onChange={(event) => setQ0Draft(event.target.value)}
        >
          {[1, 2, 3, 4, 5].map((score) => (
            <option key={score} value={score}>
              {score}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 md:col-span-2">
        <span className="aurora-title-label">Style Keywords</span>
        <input
          className="w-full rounded-[18px] border border-white/14 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-200/45"
          value={styleDraft}
          onChange={(event) => setStyleDraft(event.target.value)}
          placeholder="editorial, calm, ritual"
        />
      </label>
      <label className="space-y-2 md:col-span-2">
        <span className="aurora-title-label">Design Requirement</span>
        <textarea
          className="min-h-[110px] w-full rounded-[18px] border border-white/14 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-200/45"
          value={constraintDraft}
          onChange={(event) => setConstraintDraft(event.target.value)}
          placeholder="What must stay true in the final design?"
        />
      </label>
      <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-3">
        <p className="text-xs text-slate-300">
          Save the brief, let Aurora re-check clarity, then continue only when the gate turns ready.
        </p>
        <button
          className="aurora-btn-cta rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
          type="button"
          disabled={busy}
          onClick={() =>
            onUpdateBrief?.({
              product: productDraft,
              audience: audienceDraft,
              firstDeliverable: firstDeliverableDraft,
              styleKeywords: styleDraft
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
              constraint: constraintDraft,
              q0IntentConfidence: Number(q0Draft)
            })
          }
        >
          Save and Re-check
        </button>
      </div>
    </div>
  );
}

export function DefineScene({
  stage,
  direction = null,
  brief = null,
  onUpdateBrief,
  busy = false,
  autoAdvance = null
}: DefineSceneProps) {
  const [openPanel, setOpenPanel] = useState<DefineFocusPanelId | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const ready = Boolean(direction);
  const assetIntent = direction?.asset_intent;
  const clarity = direction?.clarity;
  const readyForConcepts = clarity?.ready_for_concepts !== false;
  const primaryBriefCards: BriefCard[] = [];
  const supportingBriefCards: BriefCard[] = [];

  const formatCountdown = (secondsRemaining: number | null): string => {
    if (secondsRemaining === null) {
      return "Manual control";
    }
    const clamped = Math.max(0, secondsRemaining);
    const minutes = Math.floor(clamped / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (clamped % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  if (brief?.product) {
    primaryBriefCards.push({
      label: "Product",
      value: brief.product
    });
  }
  if (brief?.audience) {
    primaryBriefCards.push({
      label: "Audience",
      value: brief.audience
    });
  }
  if (brief?.firstDeliverable) {
    primaryBriefCards.push({
      label: "First Deliverable",
      value: brief.firstDeliverable
    });
  }
  if (brief?.styleKeywords?.length) {
    primaryBriefCards.push({
      label: "Style Keywords",
      value: brief.styleKeywords.join(", ")
    });
  }
  if (brief?.constraint) {
    supportingBriefCards.push({
      label: "Design Requirement",
      value: brief.constraint
    });
  }
  if (typeof brief?.q0IntentConfidence === "number") {
    supportingBriefCards.push({
      label: "Q0 Confidence",
      value: `${brief.q0IntentConfidence}/5`
    });
  }

  const followupQuestions = (clarity?.followup_questions ?? [direction?.next_question ?? ""]).filter(Boolean);
  const directionSnapshotCards = direction
    ? [
        { label: "Brand Promise", value: direction.brand_promise },
        { label: "Audience Tension", value: direction.audience_tension },
        { label: "Image Intent", value: direction.image_intent },
        {
          label: "Bundle Focus",
          value: assetIntent?.focus ? `${assetIntent.focus} focus` : "Balanced focal scene + environment + signature detail"
        }
      ]
    : [];
  const principleSections = direction
    ? [
        { label: "Voice Principles", items: direction.voice_principles },
        { label: "Anti-goals", items: direction.anti_goals },
        { label: "Visual Principles", items: direction.visual_principles }
      ].filter((section) => section.items.length > 0)
    : [];
  const nextQuestion = readyForConcepts ? assetIntent?.question ?? direction?.next_question ?? "" : followupQuestions[0] ?? "";
  const bundleDefault = assetIntent?.default_bundle ?? "Balanced focal scene + environment + signature detail";
  const briefEditorKey = `${brief?.product ?? ""}::${brief?.audience ?? ""}::${brief?.firstDeliverable ?? ""}::${
    brief?.styleKeywords.join("|") ?? ""
  }::${brief?.constraint ?? ""}::${brief?.q0IntentConfidence ?? ""}`;
  const focusPanels: Array<{ id: DefineFocusPanelId; label: string; summary: string }> = ready
    ? [
        {
          id: "snapshot",
          label: "Direction Snapshot",
          summary: direction?.brief_summary ?? "Open the working direction Aurora synthesized from the brief."
        },
        {
          id: "mechanics",
          label: "Mechanism",
          summary: clarity?.summary ?? "Check readiness, missing inputs, and the default bundle Aurora will use next."
        },
        {
          id: "supporting",
          label: "Supporting Detail",
          summary: direction?.narrative_summary ?? "Open narrative detail, voice principles, anti-goals, and visual rules."
        },
        {
          id: "prompt",
          label: "Prompt Seed",
          summary: direction?.prompt_seed ?? "Open the prompt seed and priority order for concept generation."
        }
      ]
    : [];
  const openPanelTitle =
    openPanel === "snapshot"
      ? "Direction Snapshot"
      : openPanel === "mechanics"
        ? "Direction Mechanics"
        : openPanel === "supporting"
          ? "Supporting Detail"
          : openPanel === "prompt"
            ? "Prompt Seed"
            : null;

  useEffect(() => {
    if (!openPanel) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPanel(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openPanel]);

  useEffect(() => {
    if (!readyForConcepts) {
      setGuideOpen(true);
    }
  }, [readyForConcepts]);

  const nextActionTitle = readyForConcepts ? "Generate 3 Concepts" : "Answer the missing brief question";
  const nextActionSummary = readyForConcepts
    ? autoAdvance?.waiting
      ? "DEFINE is paused. Send one more steer if needed, then resume the timer or generate now."
      : "The direction is clear enough. Generate the first 3 concept bundles when the brief feels aligned."
    : "Aurora still needs a clearer brief signal before moving into EXPLORE.";
  const timingLabel = !readyForConcepts
    ? "Blocked until brief is clearer"
    : autoAdvance?.waiting
      ? "Paused on hold"
      : autoAdvance?.enabled
        ? "Auto timer is active"
        : "Manual continue";
  const actionStatusBadge = !readyForConcepts
    ? "Blocked"
    : autoAdvance?.waiting
      ? "Hold"
      : autoAdvance?.enabled
        ? formatCountdown(autoAdvance.secondsRemaining)
        : "Ready";
  const primaryCtaLabel = readyForConcepts && autoAdvance?.onGenerate ? "Generate 3 Concepts" : null;
  const secondaryCtaLabel = readyForConcepts
    ? autoAdvance?.waiting
      ? "Resume Timer"
      : autoAdvance?.enabled
        ? "Hold"
        : null
    : null;
  const guideSections = readyForConcepts
    ? [
        {
          label: "Why this step",
          body: clarity?.summary ?? "Aurora has enough signal to create the first comparison set."
        },
        {
          label: "What to check",
          body: "Make sure the working direction, image intent, and audience tension still match what you want to generate first."
        },
        {
          label: "What happens next",
          body: "Aurora generates 3 concept bundles in EXPLORE. You will compare them and choose one route to lock."
        },
        {
          label: "If stuck",
          body: "Send one plain sentence like 'keep the heroine regal, less horror-heavy, more ceremonial lighting' and Aurora will fold it into DEFINE first."
        }
      ]
    : [
        {
          label: "Why this step",
          body: clarity?.summary ?? "Aurora still needs a clearer brief before concept generation."
        },
        {
          label: "What to answer",
          body: followupQuestions[0] ?? "Clarify the brief before continuing."
        },
        {
          label: "What happens next",
          body: "Once the missing brief input is saved, Aurora re-checks clarity and unlocks concept generation."
        },
        {
          label: "If stuck",
          body: "State the product, audience, and must-keep design requirement in one direct sentence. Aurora only needs the first strong signal."
        }
      ];

  return (
    <div className="space-y-4">
      {ready && direction ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.16fr)_minmax(20.5rem,0.84fr)]">
          <div className="space-y-4">
            <div className="aurora-panel rounded-[28px] p-4 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <p className="aurora-title-label">At A Glance</p>
                  <h3 className="aurora-title-primary mt-2 text-[1.16rem]">Working direction</h3>
                  <p className="aurora-text-body mt-3 text-slate-100">{direction.brief_summary}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={readyForConcepts ? "aurora-chip" : "aurora-chip-soft"}>{clarity?.score ?? 3}/5 clarity</span>
                  <button
                    className="aurora-btn-secondary rounded-full px-3 py-1.5 text-sm font-semibold"
                    type="button"
                    onClick={() => setOpenPanel("snapshot")}
                  >
                    Open Snapshot
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {directionSnapshotCards.map((card) => (
                  <div key={card.label} className="aurora-surface-soft rounded-[20px] p-3.5">
                    <p className="aurora-title-label">{card.label}</p>
                    <p className="aurora-text-meta mt-2 text-slate-200">{card.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="aurora-panel rounded-[28px] p-4 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <p className="aurora-title-label">Current Focus</p>
                  <h3 className="aurora-title-primary mt-2 text-[1.16rem]">
                    {readyForConcepts ? "Direction is ready for concept generation." : "More input is still required."}
                  </h3>
                  <p className="aurora-text-meta mt-2 text-slate-300">
                    {readyForConcepts
                      ? "Keep the working direction, focus, and first image question aligned before generating concepts."
                      : "Tighten the missing brief signal first so the first concept pass lands closer to intent."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {focusPanels
                    .filter((panel) => panel.id !== "snapshot")
                    .map((panel) => (
                      <button
                        key={panel.id}
                        className="aurora-btn-secondary rounded-full px-3 py-1.5 text-sm font-semibold"
                        type="button"
                        onClick={() => setOpenPanel(panel.id)}
                      >
                        {panel.label}
                      </button>
                    ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="aurora-surface-soft rounded-[20px] p-3.5">
                  <p className="aurora-title-label">Bundle Focus</p>
                  <p className="aurora-text-body mt-2 text-slate-100">{bundleDefault}</p>
                </div>
                <div className="aurora-surface-soft rounded-[20px] p-3.5">
                  <p className="aurora-title-label">Chat Steer</p>
                  <p className="aurora-text-body mt-2 text-slate-100">{nextQuestion}</p>
                </div>
                <div className="aurora-surface-soft rounded-[20px] p-3.5">
                  <p className="aurora-title-label">Direction Clarity</p>
                  <p className="aurora-text-meta mt-2 text-slate-300">
                    {clarity?.summary ?? "Aurora will evaluate whether this brief is clear enough to generate concepts."}
                  </p>
                </div>
                <div className="aurora-surface-soft rounded-[20px] p-3.5">
                  <p className="aurora-title-label">{readyForConcepts ? "Default Bundle Rationale" : "Missing Signal"}</p>
                  {readyForConcepts ? (
                    <p className="aurora-text-meta mt-2 text-slate-300">
                      {assetIntent?.rationale ??
                        "Aurora will balance hero, environment, and prop support unless you redirect it in chat."}
                    </p>
                  ) : (
                    <div className="mt-3">{renderTagList(clarity?.missing_inputs ?? ["A clearer brief signal"])}</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="aurora-panel rounded-[26px] border border-indigo-200/22 bg-slate-950/45 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <p className="aurora-title-label">Next Action</p>
                  <h3 className="aurora-title-primary mt-2 text-[1.18rem]">{nextActionTitle}</h3>
                  <p className="aurora-text-body mt-2 text-slate-200">{nextActionSummary}</p>
                </div>
                <span className={readyForConcepts ? "aurora-chip" : "aurora-chip-soft"}>
                  {readyForConcepts ? "Ready for EXPLORE" : "Brief update required"}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label">{readyForConcepts ? "What Aurora Will Use" : "What Aurora Still Needs"}</p>
                  <p className="aurora-text-body mt-2 text-slate-100">
                    {readyForConcepts ? bundleDefault : (clarity?.missing_inputs ?? []).join(", ") || "A clearer brief signal"}
                  </p>
                  <p className="aurora-text-meta mt-3 text-slate-300">{nextQuestion}</p>
                </div>

                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="aurora-title-label">Action Status</p>
                    <span className="aurora-chip-soft px-3">{actionStatusBadge}</span>
                  </div>
                  <p className="aurora-text-meta mt-2 text-slate-300">{timingLabel}</p>
                  {readyForConcepts ? (
                    <div className="mt-4 space-y-2">
                      {primaryCtaLabel ? (
                        <button
                          className="aurora-btn-cta w-full rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                          onClick={() => autoAdvance?.onGenerate?.()}
                          type="button"
                          disabled={!autoAdvance?.onGenerate}
                        >
                          {primaryCtaLabel}
                        </button>
                      ) : null}
                      {secondaryCtaLabel ? (
                        <button
                          className="aurora-btn-ghost w-full rounded-full px-4 py-2 text-sm"
                          onClick={() => (autoAdvance?.waiting ? autoAdvance.onResume?.() : autoAdvance?.onWait?.())}
                          type="button"
                        >
                          {secondaryCtaLabel}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="aurora-text-meta mt-4 text-slate-300">
                      Update the brief below, then Aurora will re-check clarity automatically.
                    </p>
                  )}
                </div>
              </div>

              <details
                className="mt-3 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3"
                open={guideOpen}
                onToggle={(event) => setGuideOpen(event.currentTarget.open)}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div>
                    <p className="aurora-title-label">Guide</p>
                    <p className="aurora-text-meta mt-1 text-slate-400">Open when you need context, checks, or recovery help.</p>
                  </div>
                  <span className="aurora-chip-soft px-3">Toggle</span>
                </summary>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {guideSections.map((section) => (
                    <div key={section.label} className="aurora-surface-soft rounded-[20px] p-3.5">
                      <p className="aurora-title-label">{section.label}</p>
                      <p className="aurora-text-meta mt-2 text-slate-300">{section.body}</p>
                    </div>
                  ))}
                </div>
              </details>
            </div>

            <div className="aurora-panel rounded-[26px] p-4">
              <p className="aurora-title-label">Quick</p>
              <div className="mt-3 space-y-3">
                <div className="aurora-surface-soft rounded-[20px] p-3.5">
                  <p className="aurora-title-label">Direction Clarity</p>
                  <p className="aurora-text-meta mt-2 text-slate-300">
                    {clarity?.summary ?? "Aurora will evaluate whether this brief is clear enough to generate concepts."}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="aurora-surface-soft rounded-[20px] p-3.5">
                    <p className="aurora-title-label">Default Bundle</p>
                    <p className="aurora-text-meta mt-2 text-slate-300">{bundleDefault}</p>
                  </div>
                  <div className="aurora-surface-soft rounded-[20px] p-3.5">
                    <p className="aurora-title-label">{readyForConcepts ? "Current Question" : "Need Answer"}</p>
                    <p className="aurora-text-meta mt-2 text-slate-300">{nextQuestion}</p>
                  </div>
                </div>
                {!readyForConcepts && (clarity?.missing_inputs?.length ?? 0) > 0 ? (
                  <div className="aurora-surface-soft rounded-[20px] p-3.5">
                    <p className="aurora-title-label">Still Missing</p>
                    <div className="mt-3">{renderTagList(clarity?.missing_inputs ?? [])}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="aurora-panel aurora-define-hero rounded-[28px]">
        <div
          className="aurora-define-hero-media"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(4,8,28,0.04), rgba(4,8,28,0.18)), url(${AURORA_ASSETS.heroDesktop})`
      }}
        >
          <div className="aurora-define-hero-overlay">
            <div className="max-w-3xl">
              <p className="aurora-title-label">Define Inputs</p>
              <h2 className="aurora-title-primary mt-3 text-[clamp(1.34rem,2.2vw,1.82rem)] leading-[1.05]">
                Aurora is shaping the first direction from your brief.
              </h2>
              <p className="mt-3 max-w-2xl text-[13px] text-slate-100">{stageSummary(stage)}</p>
            </div>

            {primaryBriefCards.length > 0 ? (
              <div className="aurora-define-brief-grid md:grid-cols-2 xl:grid-cols-4">
                {primaryBriefCards.map((card) => (
                  <div key={card.label} className="aurora-define-brief-card">
                    <p className="aurora-title-label">{card.label}</p>
                    <p className="aurora-text-body mt-2 line-clamp-2 text-slate-100">{card.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="aurora-define-hero-footer">
          <div className="flex flex-col gap-4">
            {supportingBriefCards.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                {supportingBriefCards.map((card) => (
                  <div key={card.label} className="aurora-surface-soft rounded-[20px] px-4 py-3">
                    <p className="aurora-title-label">{card.label}</p>
                    <p
                      className={
                        card.label === "Design Requirement"
                          ? "aurora-text-body mt-2 line-clamp-2 text-slate-200"
                          : "aurora-text-body mt-2 text-slate-200"
                      }
                    >
                      {card.value}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="aurora-title-primary mt-3 text-[clamp(1.2rem,2vw,1.58rem)] leading-[1.08]">
                  {readyForConcepts
                    ? "Align the direction before Aurora explores concepts."
                    : "Lock the brief details before Aurora explores concepts."}
                </h2>
                <p className="mt-3 max-w-2xl text-[13px] text-slate-100">
                  {readyForConcepts
                    ? "Review the short snapshot below, expand only the sections you need, then steer Aurora in chat before concept generation."
                    : "Aurora is still collecting the missing answers that make the first concept bundle strong on the first pass."}
                </p>
              </div>
              <span className={ready && readyForConcepts ? "aurora-chip" : "aurora-chip-soft"}>
                {ready ? (readyForConcepts ? "Direction Ready" : "Need More Detail") : stage.replaceAll("_", " ")}
              </span>
            </div>

            {ready && !readyForConcepts ? (
              <div className="grid gap-4 rounded-[22px] border border-amber-200/18 bg-slate-950/28 px-3.5 py-3 lg:grid-cols-[0.88fr_1.12fr]">
                <div>
                  <p className="aurora-title-label">Define Questions</p>
                  <p className="aurora-text-body mt-2 text-slate-100">
                    {clarity?.summary ?? "Aurora needs a clearer brief before concept generation."}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {(clarity?.followup_questions ?? [direction?.next_question ?? ""]).filter(Boolean).map((question) => (
                      <div key={question} className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2 aurora-text-body text-slate-200">
                        {question}
                      </div>
                    ))}
                  </div>
                </div>
                <DefineBriefEditor key={briefEditorKey} brief={brief} busy={busy} onUpdateBrief={onUpdateBrief} />
              </div>
            ) : null}

          </div>
        </div>
      </div>

      {!ready ? (
        <div className="aurora-panel rounded-[28px] p-4 text-sm text-slate-300">
          Aurora is preparing the first direction snapshot from the brief. Once ready, this canvas will show the
          creative narrative, visual principles, and the first image question.
        </div>
      ) : null}

      {ready && openPanel && openPanelTitle ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/78 px-4 py-6"
          onClick={() => setOpenPanel(null)}
        >
          <div className="flex min-h-full items-center justify-center">
            <div
              className="aurora-panel my-auto max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[30px]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                <div className="min-w-0">
                  <p className="aurora-title-label">Define Detail</p>
                  <h3 className="aurora-title-primary mt-2 text-[1.2rem]">{openPanelTitle}</h3>
                </div>
                <button
                  className="aurora-btn-ghost rounded-full px-4 py-2 text-sm"
                  type="button"
                  onClick={() => setOpenPanel(null)}
                >
                  Close
                </button>
              </div>

              <div className="max-h-[calc(88vh-5.5rem)] overflow-auto px-5 py-5">
              {openPanel === "snapshot" ? (
                <div className="space-y-4">
                  <div className="aurora-surface-soft rounded-[22px] p-4">
                    <p className="aurora-title-label">Direction Summary</p>
                    <p className="aurora-text-body mt-2 text-slate-100">{direction?.brief_summary ?? ""}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {directionSnapshotCards.map((card) => (
                      <div key={card.label} className="aurora-surface-soft rounded-[22px] p-4">
                        <p className="aurora-title-label">{card.label}</p>
                        <p className="aurora-text-body mt-2 text-slate-200">{card.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {openPanel === "mechanics" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="aurora-surface-soft rounded-[22px] p-4">
                      <p className="aurora-title-label">Direction Clarity</p>
                      <p className="aurora-text-body mt-2 text-slate-200">
                        {clarity?.summary ??
                          "Aurora will decide if the brief is specific enough before moving into concept generation."}
                      </p>
                    </div>
                    <div className="aurora-surface-soft rounded-[22px] p-4">
                      <p className="aurora-title-label">Default Bundle</p>
                      <p className="aurora-text-body mt-2 text-slate-200">{bundleDefault}</p>
                      <p className="aurora-text-meta mt-2 text-slate-400">
                        {assetIntent?.rationale ??
                          "Aurora will balance hero, environment, and prop support unless you redirect it in chat."}
                      </p>
                    </div>
                  </div>

                  {(clarity?.missing_inputs?.length ?? 0) > 0 ? (
                    <div className="aurora-surface-soft rounded-[22px] p-4">
                      <p className="aurora-title-label">Still Missing</p>
                      <div className="mt-3">{renderTagList(clarity?.missing_inputs ?? [])}</div>
                    </div>
                  ) : null}

                  {followupQuestions.length > 0 ? (
                    <div className="aurora-surface-soft rounded-[22px] p-4">
                      <p className="aurora-title-label">Follow-up Questions</p>
                      <div className="mt-3 grid gap-2">
                        {followupQuestions.map((question) => (
                          <div key={question} className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2 aurora-text-body text-slate-200">
                            {question}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {openPanel === "supporting" ? (
                <div className="space-y-4">
                  <div className="aurora-surface-soft rounded-[22px] p-4">
                    <p className="aurora-title-label">Narrative Summary</p>
                    <p className="aurora-text-body mt-2 text-slate-200">{direction?.narrative_summary ?? ""}</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {principleSections.map((section) => (
                      <div key={section.label} className="aurora-surface-soft rounded-[22px] p-4">
                        <p className="aurora-title-label">{section.label}</p>
                        <div className="mt-3">{renderTagList(section.items)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {openPanel === "prompt" ? (
                <div className="space-y-4">
                  <div className="aurora-surface-soft rounded-[22px] p-4">
                    <p className="aurora-title-label">Prompt Seed</p>
                    <p className="aurora-text-body mt-2 text-slate-200">{direction?.prompt_seed ?? ""}</p>
                  </div>
                  <div className="aurora-surface-soft rounded-[22px] p-4">
                    <p className="aurora-title-label">Priority Order</p>
                    <div className="mt-3">{renderTagList(assetIntent?.priority_order ?? ["portrait", "background", "prop"])}</div>
                  </div>
                </div>
              ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
