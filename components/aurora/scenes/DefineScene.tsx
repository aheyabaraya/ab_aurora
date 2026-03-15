"use client";

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
  } | null;
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

export function DefineScene({ stage, direction = null, brief = null, autoAdvance = null }: DefineSceneProps) {
  const ready = Boolean(direction);
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
                  Align the direction before Aurora explores concepts.
                </h2>
                <p className="mt-3 max-w-2xl text-sm text-slate-100">
                  Review the direction snapshot below, refine it in chat, then decide when Aurora should generate the
                  first three concepts.
                </p>
              </div>
              <span className={ready ? "aurora-chip" : "aurora-chip-soft"}>
                {ready ? "Direction Ready" : stage.replaceAll("_", " ")}
              </span>
            </div>

            {ready && autoAdvance ? (
              <div className="flex flex-col gap-3 rounded-[22px] border border-indigo-200/18 bg-slate-950/28 px-3.5 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Define Hold</p>
                  <p className="mt-2 text-sm text-slate-100">
                    {autoAdvance.waiting
                      ? "DEFINE stays open until you decide to continue."
                      : autoAdvance.enabled
                        ? `Auto advance to concept generation in ${formatCountdown(autoAdvance.secondsRemaining)}.`
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
              <h3 className="aurora-title-primary mt-2 text-[1.12rem]">What should Aurora explore visually first?</h3>
              <div className="aurora-surface-soft mt-4 rounded-[22px] p-4">
                <p className="text-sm text-slate-100">{direction.image_intent}</p>
              </div>
              <div className="aurora-surface-soft mt-3 rounded-[22px] p-4">
                <p className="aurora-title-label text-[10px] tracking-[0.2em]">Prompt Seed</p>
                <p className="mt-2 text-sm text-slate-200">{direction.prompt_seed}</p>
              </div>
              <div className="aurora-surface-soft mt-3 rounded-[22px] p-4">
                <p className="aurora-title-label text-[10px] tracking-[0.2em]">Ask Next</p>
                <p className="mt-2 text-sm text-slate-200">{direction.next_question}</p>
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
