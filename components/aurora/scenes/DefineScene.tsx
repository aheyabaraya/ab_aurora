"use client";

import { AURORA_ASSETS } from "../aurora-assets";

type DefineSceneProps = {
  stage: string;
  narrative?: Record<string, unknown> | null;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function stageSummary(stage: string): string {
  if (stage === "interview_collect" || stage === "intent_gate") {
    return "Start the session from the command dock to capture intent and lock direction.";
  }
  if (stage === "spec_draft") {
    return "Draft spec is being assembled from your product, audience, and style keywords.";
  }
  if (stage === "brand_narrative") {
    return "Brand narrative is being refined before candidate generation.";
  }
  return "Define context is ready and the flow will move to exploration.";
}

export function DefineScene({ stage, narrative = null }: DefineSceneProps) {
  const narrativeData = narrative && typeof narrative === "object" ? narrative : null;
  const storyArc = toStringArray(narrativeData?.story_arc);
  const voiceDo = toStringArray(narrativeData?.voice_do);
  const voiceDont = toStringArray(narrativeData?.voice_dont);
  const taglines = toStringArray(narrativeData?.tagline_candidates);

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
              <p className="aurora-title-label text-[10px] tracking-[0.28em]">
                {stage === "brand_narrative" ? "Brand Narrative" : "Define"}
              </p>
              <h2 className="aurora-title-primary mt-3 text-[clamp(1.38rem,2.2vw,1.85rem)] leading-[1.08]">
                Establish the atmosphere before branching.
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-slate-100">{stageSummary(stage)}</p>
            </div>
            <span className={stage === "brand_narrative" ? "aurora-chip" : "aurora-chip-soft"}>
              {stage.replaceAll("_", " ")}
            </span>
          </div>
        </div>
      </div>

      {stage === "brand_narrative" || narrativeData ? (
        <div className="aurora-panel rounded-[28px] p-4 text-sm text-slate-200">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="aurora-title-label text-[10px] tracking-[0.24em]">Narrative Notes</p>
              <h3 className="aurora-title-primary mt-2 text-[1.2rem]">Brand promise and voice direction.</h3>
            </div>
            <span className="aurora-chip-soft">Define Stack</span>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="aurora-surface-soft rounded-[22px] p-4">
              <p className="aurora-title-label text-[10px] tracking-[0.22em]">Promise</p>
              <p className="mt-2 text-sm text-slate-100">
                {(narrativeData?.brand_promise as string | undefined) ??
                  "Generating brand promise and voice narrative..."}
              </p>
              <p className="mt-3 text-sm text-slate-300">
                {(narrativeData?.audience_tension as string | undefined) ?? "Audience tension is being synthesized."}
              </p>
            </div>

            <div className="aurora-surface-soft rounded-[22px] p-4">
              <p className="aurora-title-label text-[10px] tracking-[0.22em]">Story Arc</p>
              {storyArc.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {storyArc.map((beat) => (
                    <li key={beat}>{beat}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-400">Story beats are still being composed.</p>
              )}
            </div>
          </div>

          {voiceDo.length > 0 || voiceDont.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="aurora-surface-soft rounded-[22px] p-4">
                <p className="aurora-title-label text-[10px] tracking-[0.22em]">Voice Do</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {voiceDo.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="aurora-surface-soft rounded-[22px] p-4">
                <p className="aurora-title-label text-[10px] tracking-[0.22em]">Voice Don&apos;t</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {voiceDont.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {taglines.length > 0 ? (
            <div className="mt-4">
              <p className="aurora-title-label text-[10px] tracking-[0.22em]">Tagline Candidates</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {taglines.map((tagline) => (
                  <span key={tagline} className="aurora-chip-soft">
                    {tagline}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
