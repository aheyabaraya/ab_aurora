"use client";

import { AURORA_ASSETS } from "../aurora-assets";
import type { DirectionRecord } from "../types";

type DefineSceneProps = {
  stage: string;
  direction?: DirectionRecord | null;
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

export function DefineScene({ stage, direction = null }: DefineSceneProps) {
  const ready = Boolean(direction);

  return (
    <div className="space-y-4">
      <div className="aurora-panel aurora-define-hero rounded-[28px]">
        <div
          className="aurora-define-hero-media"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(4,8,28,0.04), rgba(4,8,28,0.18)), url(${AURORA_ASSETS.heroDesktop})`
          }}
        />
        <div className="aurora-define-hero-footer">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="aurora-title-primary mt-3 text-[clamp(1.32rem,2.1vw,1.72rem)] leading-[1.08]">
                Align the direction before Aurora explores concepts.
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-slate-100">{stageSummary(stage)}</p>
            </div>
            <span className={ready ? "aurora-chip" : "aurora-chip-soft"}>
              {ready ? "Direction Ready" : stage.replaceAll("_", " ")}
            </span>
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
