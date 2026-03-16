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

function renderList(items: string[]) {
  return (
    <ul className="space-y-2 text-sm text-slate-300">
      {items.map((item) => (
        <li key={item} className="rounded-[18px] border border-white/8 bg-white/[0.04] px-3 py-2">
          {item}
        </li>
      ))}
    </ul>
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
  const [productDraft, setProductDraft] = useState(brief?.product ?? "");
  const [audienceDraft, setAudienceDraft] = useState(brief?.audience ?? "");
  const [styleDraft, setStyleDraft] = useState(brief?.styleKeywords.join(", ") ?? "");
  const [constraintDraft, setConstraintDraft] = useState(brief?.constraint ?? "");
  const [q0Draft, setQ0Draft] = useState<string>(brief?.q0IntentConfidence ? String(brief.q0IntentConfidence) : "3");

  useEffect(() => {
    setProductDraft(brief?.product ?? "");
    setAudienceDraft(brief?.audience ?? "");
    setStyleDraft(brief?.styleKeywords.join(", ") ?? "");
    setConstraintDraft(brief?.constraint ?? "");
    setQ0Draft(brief?.q0IntentConfidence ? String(brief.q0IntentConfidence) : "3");
  }, [brief?.audience, brief?.constraint, brief?.product, brief?.q0IntentConfidence, brief?.styleKeywords]);

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
                    ? "Review the direction snapshot below, refine it in chat, then decide when Aurora should generate the first three concept bundles."
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
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="aurora-panel rounded-[28px] p-4">
              <p className="aurora-title-label text-[10px] tracking-[0.22em]">Direction Summary</p>
              <h3 className="aurora-title-primary mt-2 text-[1.18rem]">What Aurora believes the project needs next.</h3>
              <p className="mt-3 text-sm text-slate-100">{direction.brief_summary}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Brand Promise</p>
                  <p className="mt-2 text-sm text-slate-200">{direction.brand_promise}</p>
                </div>
                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Audience Tension</p>
                  <p className="mt-2 text-sm text-slate-200">{direction.audience_tension}</p>
                </div>
              </div>
              <div className="aurora-surface-soft mt-4 rounded-[22px] p-4">
                <p className="aurora-title-label text-[10px] tracking-[0.2em]">Narrative</p>
                <p className="mt-2 text-sm text-slate-200">{direction.narrative_summary}</p>
              </div>
            </div>

            <div className="aurora-panel rounded-[28px] p-4">
              <p className="aurora-title-label text-[10px] tracking-[0.22em]">Next Guided Prompt</p>
              <h3 className="aurora-title-primary mt-2 text-[1.12rem]">
                {readyForConcepts
                  ? "What should Aurora emphasize in the first concept bundle?"
                  : "What does Aurora still need before the first concept bundle?"}
              </h3>
              <div className="aurora-surface-soft mt-4 rounded-[22px] p-4">
                <p className="text-sm text-slate-100">{direction.image_intent}</p>
              </div>
              <div className="aurora-surface-soft mt-3 rounded-[22px] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Direction Clarity</p>
                  <span className={readyForConcepts ? "aurora-chip" : "aurora-chip-soft"}>
                    {clarity?.score ?? 3}/5
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-200">
                  {clarity?.summary ??
                    "Aurora will decide if the brief is specific enough before moving into concept generation."}
                </p>
                {!readyForConcepts && (clarity?.missing_inputs?.length ?? 0) > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {clarity?.missing_inputs?.map((item) => (
                      <span key={item} className="aurora-chip-soft">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="aurora-surface-soft mt-3 rounded-[22px] p-4">
                <p className="aurora-title-label text-[10px] tracking-[0.2em]">Bundle Focus</p>
                <p className="mt-2 text-sm text-slate-200">
                  {assetIntent?.focus ? `${assetIntent.focus} focus` : "balanced focus"}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  {assetIntent?.rationale ??
                    "Aurora will balance one hero image with environment and prop support unless you redirect it in chat."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(assetIntent?.priority_order ?? ["portrait", "background", "prop"]).map((item) => (
                    <span key={item} className="aurora-chip-soft">
                      {item}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Default after hold: {assetIntent?.default_bundle ?? "balanced hero + background + prop"}
                </p>
              </div>
              <div className="aurora-surface-soft mt-3 rounded-[22px] p-4">
                <p className="aurora-title-label text-[10px] tracking-[0.2em]">Prompt Seed</p>
                <p className="mt-2 text-sm text-slate-200">{direction.prompt_seed}</p>
              </div>
              <div className="aurora-surface-soft mt-3 rounded-[22px] p-4">
                <p className="aurora-title-label text-[10px] tracking-[0.2em]">Ask Next</p>
                {readyForConcepts ? (
                  <>
                    <p className="mt-2 text-sm text-slate-200">{assetIntent?.question ?? direction.next_question}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      Reply in chat with a short steer like “portrait first”, “background heavier”, or “prop-led”.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mt-2 grid gap-2">
                      {(clarity?.followup_questions ?? [direction.next_question]).filter(Boolean).map((question) => (
                        <div key={question} className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200">
                          {question}
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Reply in chat to answer these questions. Aurora will keep refining DEFINE until the brief is specific enough.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="aurora-panel rounded-[26px] p-4">
              <p className="aurora-title-label text-[10px] tracking-[0.2em]">Voice Principles</p>
              <div className="mt-3">{renderList(direction.voice_principles)}</div>
            </div>
            <div className="aurora-panel rounded-[26px] p-4">
              <p className="aurora-title-label text-[10px] tracking-[0.2em]">Anti-goals</p>
              <div className="mt-3">{renderList(direction.anti_goals)}</div>
            </div>
            <div className="aurora-panel rounded-[26px] p-4">
              <p className="aurora-title-label text-[10px] tracking-[0.2em]">Visual Principles</p>
              <div className="mt-3">{renderList(direction.visual_principles)}</div>
            </div>
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
