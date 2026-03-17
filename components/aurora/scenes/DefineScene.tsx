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
    styleKeywords: string[];
    constraint?: string | null;
    q0IntentConfidence?: number | null;
  } | null;
  onUpdateBrief?: (input: {
    product: string;
    audience: string;
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
  } | null;
};

type BriefCard = {
  label: string;
  value: string;
};

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
  const [styleDraft, setStyleDraft] = useState(brief?.styleKeywords.join(", ") ?? "");
  const [constraintDraft, setConstraintDraft] = useState(brief?.constraint ?? "");
  const [q0Draft, setQ0Draft] = useState<string>(brief?.q0IntentConfidence ? String(brief.q0IntentConfidence) : "3");

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-2 md:col-span-2">
        <span className="aurora-title-label text-[10px] tracking-[0.18em]">Product</span>
        <input
          className="w-full rounded-[18px] border border-white/14 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-200/45"
          value={productDraft}
          onChange={(event) => setProductDraft(event.target.value)}
          placeholder="What exactly are you building?"
        />
      </label>
      <label className="space-y-2">
        <span className="aurora-title-label text-[10px] tracking-[0.18em]">Audience</span>
        <input
          className="w-full rounded-[18px] border border-white/14 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-200/45"
          value={audienceDraft}
          onChange={(event) => setAudienceDraft(event.target.value)}
          placeholder="Who is this for first?"
        />
      </label>
      <label className="space-y-2">
        <span className="aurora-title-label text-[10px] tracking-[0.18em]">Q0 Confidence</span>
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
        <span className="aurora-title-label text-[10px] tracking-[0.18em]">Style Keywords</span>
        <input
          className="w-full rounded-[18px] border border-white/14 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-200/45"
          value={styleDraft}
          onChange={(event) => setStyleDraft(event.target.value)}
          placeholder="editorial, calm, ritual"
        />
      </label>
      <label className="space-y-2 md:col-span-2">
        <span className="aurora-title-label text-[10px] tracking-[0.18em]">Design Requirement</span>
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
  const ready = Boolean(direction);
  const assetIntent = direction?.asset_intent;
  const clarity = direction?.clarity;
  const readyForConcepts = clarity?.ready_for_concepts !== false;
  const briefCards: BriefCard[] = [];

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
    briefCards.push({
      label: "Product",
      value: brief.product
    });
  }
  if (brief?.audience) {
    briefCards.push({
      label: "Audience",
      value: brief.audience
    });
  }
  if (brief?.styleKeywords?.length) {
    briefCards.push({
      label: "Style Keywords",
      value: brief.styleKeywords.join(", ")
    });
  }
  if (brief?.constraint) {
    briefCards.push({
      label: "Design Requirement",
      value: brief.constraint
    });
  }
  if (typeof brief?.q0IntentConfidence === "number") {
    briefCards.push({
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
          value: assetIntent?.focus ? `${assetIntent.focus} focus` : "Balanced hero + background + prop"
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
  const bundleDefault = assetIntent?.default_bundle ?? "Balanced hero + background + prop";
  const briefEditorKey = `${brief?.product ?? ""}::${brief?.audience ?? ""}::${brief?.styleKeywords.join("|") ?? ""}::${
    brief?.constraint ?? ""
  }::${brief?.q0IntentConfidence ?? ""}`;

  return (
    <div className="space-y-4">
      <div className="aurora-panel aurora-define-hero rounded-[28px]">
        <div
          className="aurora-define-hero-media"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(4,8,28,0.04), rgba(4,8,28,0.18)), url(${AURORA_ASSETS.heroDesktop})`
      }}
        >
          <div className="aurora-define-hero-overlay">
            <div className="max-w-3xl">
              <p className="aurora-title-label text-[10px] tracking-[0.22em]">Define Inputs</p>
              <h2 className="aurora-title-primary mt-3 text-[clamp(1.48rem,2.4vw,1.96rem)] leading-[1.04]">
                Aurora is shaping the first direction from your brief.
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-slate-100">{stageSummary(stage)}</p>
            </div>

            {briefCards.length > 0 ? (
              <div className="aurora-define-brief-grid">
                {briefCards.map((card) => (
                  <div key={card.label} className="aurora-define-brief-card">
                    <p className="aurora-title-label text-[10px] tracking-[0.2em]">{card.label}</p>
                    <p className="mt-2 line-clamp-3 text-sm text-slate-100">{card.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="aurora-define-hero-footer">
          <div className="flex flex-col gap-4">
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
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Define Questions</p>
                  <p className="mt-2 text-sm text-slate-100">
                    {clarity?.summary ?? "Aurora needs a clearer brief before concept generation."}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {(clarity?.followup_questions ?? [direction?.next_question ?? ""]).filter(Boolean).map((question) => (
                      <div key={question} className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200">
                        {question}
                      </div>
                    ))}
                  </div>
                </div>
                <DefineBriefEditor key={briefEditorKey} brief={brief} busy={busy} onUpdateBrief={onUpdateBrief} />
              </div>
            ) : null}

            {ready && readyForConcepts && autoAdvance ? (
              <div className="flex flex-col gap-3 rounded-[22px] border border-indigo-200/18 bg-slate-950/28 px-3.5 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Define Hold</p>
                  <p className="mt-2 text-sm text-slate-100">
                    {autoAdvance.waiting
                      ? "DEFINE stays open until you decide to continue."
                      : autoAdvance.enabled
                        ? `Auto advance to concept generation in ${formatCountdown(autoAdvance.secondsRemaining)}. If you do nothing, Aurora will use the balanced hero + background + prop bundle.`
                        : "Auto advance is off. Continue manually when you are ready."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="aurora-btn-cta rounded-full px-4 py-2 text-sm font-semibold"
                    onClick={() => autoAdvance.onGenerate?.()}
                    type="button"
                  >
                    Generate Concepts
                  </button>
                  <button
                    className="aurora-btn-ghost rounded-full px-4 py-2 text-sm"
                    onClick={() => autoAdvance.onWait?.()}
                    type="button"
                  >
                    Wait
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {ready && direction ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.16fr)_minmax(0,0.84fr)]">
          <div className="space-y-4">
            <div className="aurora-panel rounded-[28px] p-4 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <p className="aurora-title-label text-[10px] tracking-[0.22em]">Direction Snapshot</p>
                  <h3 className="aurora-title-primary mt-2 text-[1.2rem]">The direction in one pass.</h3>
                  <p className="mt-3 text-[15px] leading-7 text-slate-100">{direction.brief_summary}</p>
                </div>
                <span className={readyForConcepts ? "aurora-chip" : "aurora-chip-soft"}>
                  {clarity?.score ?? 3}/5 clarity
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {directionSnapshotCards.map((card) => (
                  <div key={card.label} className="aurora-surface-soft rounded-[22px] p-4">
                    <p className="aurora-title-label text-[10px] tracking-[0.2em]">{card.label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">{card.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <details className="aurora-panel rounded-[26px] p-4 md:p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div>
                  <p className="aurora-title-label text-[10px] tracking-[0.22em]">Supporting Detail</p>
                  <p className="mt-1 text-sm text-slate-200">Narrative and principle lists stay available without crowding the main view.</p>
                </div>
                <span className="aurora-chip-soft px-3 text-[10px]">Expand</span>
              </summary>

              <div className="mt-4 space-y-4">
                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Narrative Summary</p>
                  <p className="mt-2 text-sm leading-7 text-slate-200">{direction.narrative_summary}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {principleSections.map((section) => (
                    <div key={section.label} className="aurora-surface-soft rounded-[22px] p-4">
                      <p className="aurora-title-label text-[10px] tracking-[0.2em]">{section.label}</p>
                      <div className="mt-3">{renderTagList(section.items)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </div>

          <div className="space-y-4">
            <div className="aurora-panel rounded-[28px] p-4 md:p-5">
              <p className="aurora-title-label text-[10px] tracking-[0.22em]">
                {readyForConcepts ? "Next With Aurora" : "What Still Needs Detail"}
              </p>
              <h3 className="aurora-title-primary mt-2 text-[1.14rem]">
                {readyForConcepts ? "Steer the first concept set." : "Tighten the brief before exploration."}
              </h3>

              <div className="aurora-surface-soft mt-4 rounded-[22px] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Ask Next</p>
                  <span className={readyForConcepts ? "aurora-chip" : "aurora-chip-soft"}>
                    {readyForConcepts ? "Chat steer" : "Required"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-100">{nextQuestion}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {readyForConcepts
                    ? "Reply in chat with a short steer like portrait-first, background-heavier, or prop-led."
                    : "Answer in chat or update the fields above so Aurora can pass the clarity gate."}
                </p>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Direction Clarity</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    {clarity?.summary ??
                      "Aurora will decide if the brief is specific enough before moving into concept generation."}
                  </p>
                </div>

                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Default Bundle</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">{bundleDefault}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {assetIntent?.rationale ??
                      "Aurora will balance hero, environment, and prop support unless you redirect it in chat."}
                  </p>
                </div>
              </div>

              {!readyForConcepts && (clarity?.missing_inputs?.length ?? 0) > 0 ? (
                <div className="aurora-surface-soft mt-3 rounded-[22px] p-4">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Still Missing</p>
                  <div className="mt-3">{renderTagList(clarity?.missing_inputs ?? [])}</div>
                </div>
              ) : null}

              {!readyForConcepts && followupQuestions.length > 1 ? (
                <div className="aurora-surface-soft mt-3 rounded-[22px] p-4">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Remaining Questions</p>
                  <div className="mt-3 grid gap-2">
                    {followupQuestions.slice(1).map((question) => (
                      <div key={question} className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200">
                        {question}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <details className="aurora-panel rounded-[26px] p-4 md:p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div>
                  <p className="aurora-title-label text-[10px] tracking-[0.22em]">Prompt Seed</p>
                  <p className="mt-1 text-sm text-slate-200">Keep the detailed generation rationale nearby, not in the primary scan path.</p>
                </div>
                <span className="aurora-chip-soft px-3 text-[10px]">Expand</span>
              </summary>

              <div className="mt-4 space-y-3">
                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Prompt Seed</p>
                  <p className="mt-2 text-sm leading-7 text-slate-200">{direction.prompt_seed}</p>
                </div>

                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Priority Order</p>
                  <div className="mt-3">{renderTagList(assetIntent?.priority_order ?? ["portrait", "background", "prop"])}</div>
                </div>
              </div>
            </details>
          </div>
        </div>
      ) : (
        <div className="aurora-panel rounded-[28px] p-4 text-sm text-slate-300">
          Aurora is preparing the first direction snapshot from the brief. Once ready, this canvas will show the
          creative narrative, visual principles, and the first image question.
        </div>
      )}
    </div>
  );
}
