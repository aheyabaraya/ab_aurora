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
      <div className="aurora-panel aurora-define-hero overflow-hidden rounded-2xl">
        <div
          className="aurora-define-hero-media"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(4,8,28,0.14), rgba(4,8,28,0.72)), url(${AURORA_ASSETS.heroDesktop})`
          }}
        />
        <div className="aurora-define-hero-footer">
          <p className="aurora-title-label text-xs uppercase tracking-[0.3em]">
            {stage === "brand_narrative" ? "BRAND NARRATIVE" : "DEFINE"}
          </p>
          <p className="mt-2 text-sm text-slate-100">{stageSummary(stage)}</p>
        </div>
      </div>

      {stage === "brand_narrative" || narrativeData ? (
        <div className="aurora-panel rounded-2xl p-4 text-sm text-slate-200">
          <p className="aurora-title-label text-xs uppercase tracking-[0.2em]">Brand Narrative</p>
          <p className="mt-2">
            {(narrativeData?.brand_promise as string | undefined) ??
              "Generating brand promise and voice narrative..."}
          </p>
          <p className="mt-2 text-slate-300">
            {(narrativeData?.audience_tension as string | undefined) ?? "Audience tension is being synthesized."}
          </p>
          {storyArc.length > 0 ? (
            <div className="mt-3">
              <p className="aurora-title-label text-[11px] uppercase tracking-[0.2em]">Story Arc</p>
              <ul className="mt-1 space-y-1 text-slate-300">
                {storyArc.map((beat) => (
                  <li key={beat}>- {beat}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {voiceDo.length > 0 || voiceDont.length > 0 ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="aurora-title-label text-[11px] uppercase tracking-[0.2em]">Voice Do</p>
                <ul className="mt-1 space-y-1 text-slate-300">
                  {voiceDo.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="aurora-title-label text-[11px] uppercase tracking-[0.2em]">Voice Don&apos;t</p>
                <ul className="mt-1 space-y-1 text-slate-300">
                  {voiceDont.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          {taglines.length > 0 ? (
            <div className="mt-3">
              <p className="aurora-title-label text-[11px] uppercase tracking-[0.2em]">Tagline Candidates</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {taglines.map((tagline) => (
                  <span
                    key={tagline}
                    className="rounded-full border border-indigo-200/35 bg-indigo-400/10 px-2 py-1 text-[11px] text-indigo-100"
                  >
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
