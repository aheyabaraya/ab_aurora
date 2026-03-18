"use client";

import { useState } from "react";
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

  return (
    <div className="space-y-4">
      {ready && readyForConcepts && autoAdvance ? (
        <div className="aurora-panel rounded-[26px] border border-indigo-200/24 bg-slate-950/48 px-4 py-4 xl:sticky xl:top-4 xl:z-10">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] xl:items-center">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="aurora-chip px-3 aurora-text-label">Define Hold</span>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 aurora-text-meta text-slate-300">
                  {autoAdvance.waiting ? "Paused" : autoAdvance.enabled ? "Auto timer active" : "Manual continue"}
                </span>
              </div>
              <h3 className="aurora-title-primary text-[1.08rem] leading-[1.12]">Concept generation control</h3>
              <p className="aurora-text-body max-w-3xl text-slate-200">
                {autoAdvance.waiting
                  ? "Hold is active. Send one more steer in chat, then choose whether to resume the timer or generate immediately."
                  : autoAdvance.enabled
                    ? `Aurora will use ${bundleDefault.toLowerCase()} unless you add another steer before the timer ends.`
                    : "Auto advance is off. Review the direction, steer in chat if needed, then generate manually."}
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="aurora-surface-soft rounded-[20px] p-3">
                  <p className="aurora-title-label">What To Do Now</p>
                  <p className="aurora-text-meta mt-2 text-slate-300">
                    {autoAdvance.waiting
                      ? "1. Send a steer in chat. 2. Resume timer or Generate Now."
                      : "Review the working direction, then either Hold or let the timer continue."}
                  </p>
                </div>
                <div className="aurora-surface-soft rounded-[20px] p-3">
                  <p className="aurora-title-label">Chat Behavior</p>
                  <p className="aurora-text-meta mt-2 text-slate-300">
                    Sending a chat steer resets the DEFINE countdown to 01:00 so you have time to react.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-3">
              <div className="rounded-[20px] border border-white/12 bg-white/[0.05] px-4 py-3 text-center">
                <p className="aurora-title-label">Countdown</p>
                <p className="mt-1 text-[1.35rem] font-semibold leading-none text-slate-50">
                  {autoAdvance.waiting || !autoAdvance.enabled ? "Hold" : formatCountdown(autoAdvance.secondsRemaining)}
                </p>
                <p className="aurora-text-meta mt-2 text-slate-400">
                  {autoAdvance.waiting ? "Paused until resume" : "Only the timer value updates."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {autoAdvance.waiting ? (
                  <>
                    <button
                      className="aurora-btn-cta rounded-full px-4 py-2 text-sm font-semibold"
                      onClick={() => autoAdvance.onResume?.()}
                      type="button"
                    >
                      Resume Timer
                    </button>
                    <button
                      className="aurora-btn-secondary rounded-full px-4 py-2 text-sm font-semibold"
                      onClick={() => autoAdvance.onGenerate?.()}
                      type="button"
                    >
                      Generate Now
                    </button>
                  </>
                ) : autoAdvance.enabled ? (
                  <>
                    <button
                      className="aurora-btn-ghost rounded-full px-4 py-2 text-sm"
                      onClick={() => autoAdvance.onWait?.()}
                      type="button"
                    >
                      Hold
                    </button>
                    <button
                      className="aurora-btn-cta rounded-full px-4 py-2 text-sm font-semibold"
                      onClick={() => autoAdvance.onGenerate?.()}
                      type="button"
                    >
                      Generate Now
                    </button>
                  </>
                ) : (
                  <button
                    className="aurora-btn-cta rounded-full px-4 py-2 text-sm font-semibold"
                    onClick={() => autoAdvance.onGenerate?.()}
                    type="button"
                  >
                    Generate Now
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {ready && direction ? (
        <div className="aurora-panel rounded-[26px] border border-indigo-200/22 bg-slate-950/45 px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <p className="aurora-title-label">Next Action</p>
              <h3 className="aurora-title-primary mt-2 text-[1.18rem]">
                {readyForConcepts ? "Steer concept generation before EXPLORE starts." : "Fill missing inputs before concept generation."}
              </h3>
              <p className="aurora-text-body mt-2 text-slate-200">
                {readyForConcepts
                  ? "Give one concise chat steer on what to emphasize first, then move into concept generation."
                  : "Aurora still needs a clearer brief signal. Answer the current question first, then regenerate direction."}
              </p>
            </div>
            <span className={readyForConcepts ? "aurora-chip" : "aurora-chip-soft"}>
              {readyForConcepts ? "Chat steer required" : "Brief update required"}
            </span>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="aurora-surface-soft rounded-[22px] p-4">
              <p className="aurora-title-label">Ask Next</p>
              <p className="aurora-text-body mt-2 text-slate-100">{nextQuestion}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="aurora-surface-soft rounded-[22px] p-4">
                <p className="aurora-title-label">Direction Clarity</p>
                <p className="aurora-text-meta mt-2 text-slate-300">
                  {clarity?.summary ?? "Aurora will evaluate whether this brief is clear enough to generate concepts."}
                </p>
              </div>
              <div className="aurora-surface-soft rounded-[22px] p-4">
                <p className="aurora-title-label">{readyForConcepts ? "Default Bundle" : "Missing Inputs"}</p>
                <p className="aurora-text-meta mt-2 text-slate-300">
                  {readyForConcepts ? bundleDefault : (clarity?.missing_inputs ?? []).join(", ") || "None"}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {ready && focusPanels.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-4">
          {focusPanels.map((panel) => (
            <div key={panel.id} className="aurora-panel rounded-[24px] p-4">
              <p className="aurora-title-label">{panel.label}</p>
              <p className="aurora-text-meta mt-2 line-clamp-3 text-slate-300">{panel.summary}</p>
              <button
                className="aurora-btn-secondary mt-3 rounded-full px-4 py-2 text-sm font-semibold"
                type="button"
                onClick={() => setOpenPanel(panel.id)}
              >
                Open Panel
              </button>
            </div>
          ))}
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
              <h2 className="aurora-title-primary mt-3 text-[clamp(1.48rem,2.4vw,1.96rem)] leading-[1.04]">
                Aurora is shaping the first direction from your brief.
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-slate-100">{stageSummary(stage)}</p>
            </div>

            {primaryBriefCards.length > 0 ? (
              <div className="aurora-define-brief-grid">
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
                <h2 className="aurora-title-primary mt-3 text-[clamp(1.32rem,2.1vw,1.72rem)] leading-[1.08]">
                  {readyForConcepts
                    ? "Align the direction before Aurora explores concepts."
                    : "Lock the brief details before Aurora explores concepts."}
                </h2>
                <p className="mt-3 max-w-2xl text-sm text-slate-100">
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

      {ready && direction ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="aurora-panel rounded-[28px] p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <p className="aurora-title-label">At A Glance</p>
                <h3 className="aurora-title-primary mt-2 text-[1.12rem]">Working direction</h3>
                <p className="aurora-text-body mt-3 text-slate-100">{direction.brief_summary}</p>
              </div>
              <span className={readyForConcepts ? "aurora-chip" : "aurora-chip-soft"}>{clarity?.score ?? 3}/5 clarity</span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {directionSnapshotCards.map((card) => (
                <div key={card.label} className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label">{card.label}</p>
                  <p className="aurora-text-meta mt-2 text-slate-200">{card.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="aurora-panel rounded-[28px] p-4 md:p-5">
              <p className="aurora-title-label">Readiness</p>
              <h3 className="aurora-title-primary mt-2 text-[1.12rem]">
                {readyForConcepts ? "Ready to move into EXPLORE." : "More input is still required."}
              </h3>

              <div className="mt-3 space-y-3">
                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label">Direction Clarity</p>
                  <p className="aurora-text-meta mt-2 text-slate-300">
                    {clarity?.summary ?? "Aurora will decide if the brief is specific enough before moving into concept generation."}
                  </p>
                </div>

                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label">Default Bundle</p>
                  <p className="aurora-text-meta mt-2 text-slate-300">{bundleDefault}</p>
                </div>

                {!readyForConcepts && (clarity?.missing_inputs?.length ?? 0) > 0 ? (
                  <div className="aurora-surface-soft rounded-[22px] p-4">
                    <p className="aurora-title-label">Still Missing</p>
                    <div className="mt-3">{renderTagList(clarity?.missing_inputs ?? [])}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="aurora-surface-soft rounded-[24px] p-4">
              <p className="aurora-title-label">Detailed Panels</p>
              <p className="aurora-text-meta mt-2 text-slate-300">
                Open the panels above to inspect Direction Snapshot, Mechanism, Supporting Detail, and Prompt Seed without
                losing your place in DEFINE.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="aurora-panel rounded-[28px] p-4 text-sm text-slate-300">
          Aurora is preparing the first direction snapshot from the brief. Once ready, this canvas will show the
          creative narrative, visual principles, and the first image question.
        </div>
      )}

      {ready && openPanel && openPanelTitle ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/78 px-4 py-6">
          <div className="aurora-panel max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[30px]">
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
      ) : null}
    </div>
  );
}
