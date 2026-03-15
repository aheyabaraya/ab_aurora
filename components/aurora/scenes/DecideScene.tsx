"use client";

import Image from "next/image";
import { getTop3CardAsset } from "../aurora-assets";
import type { Candidate, ModelSource } from "../types";

type DecideSceneProps = {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  modelSource: ModelSource;
  busy: boolean;
  buildRequired: boolean;
  onSelect: (candidateId: string) => void;
  onConfirmBuild: () => void;
};

function modelBadgeClass(modelSource: ModelSource): string {
  if (modelSource === "OPENAI") {
    return "border-indigo-200/50 bg-indigo-400/18 text-indigo-50";
  }
  if (modelSource === "MOCK") {
    return "border-slate-500/50 bg-slate-700/30 text-slate-100";
  }
  return "border-indigo-200/24 bg-slate-900/70 text-slate-300";
}

export function DecideScene({
  candidates,
  selectedCandidateId,
  modelSource,
  busy,
  buildRequired,
  onSelect,
  onConfirmBuild
}: DecideSceneProps) {
  const focusCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId) ?? candidates[0] ?? null;
  const comparisonCandidates = focusCandidate
    ? candidates.filter((candidate) => candidate.id !== focusCandidate.id)
    : candidates.slice(0, 2);

  if (!focusCandidate) {
    return (
      <div className="aurora-panel rounded-[28px] p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="aurora-title-label text-[10px] tracking-[0.22em]">Decide</p>
            <p className="mt-2 text-sm text-slate-200">Choose a concept in EXPLORE before locking the direction.</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${modelBadgeClass(modelSource)}`}>
            {modelSource}
          </span>
        </div>
      </div>
    );
  }

  const focusColors = focusCandidate.moodboard.colors.slice(0, 4);
  const focusAsset = getTop3CardAsset(focusCandidate.rank);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="aurora-title-primary text-[1.28rem]">Lock one direction and move it toward build approval.</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Focus on one concept, compare the remaining routes quickly, then approve the build when the route feels
            stable.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${modelBadgeClass(modelSource)}`}>
          {modelSource}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.24fr)_minmax(18rem,0.76fr)]">
        <article className="aurora-panel overflow-hidden rounded-[28px]">
          <div className="aurora-candidate-media relative aspect-[16/10] w-full">
            {focusCandidate.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={focusCandidate.image_url}
                alt={`${focusCandidate.naming.recommended} selected concept`}
                className="h-full w-full object-cover"
              />
            ) : (
              <Image
                src={focusAsset.image}
                alt={`${focusAsset.name} concept card`}
                width={1024}
                height={768}
                className="h-full w-full object-cover"
                sizes="(min-width: 1280px) 46vw, 100vw"
                priority
              />
            )}

            <div className="absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-2">
              <span className="aurora-chip">#{focusCandidate.rank}</span>
              <span className="aurora-chip-soft">{selectedCandidateId ? "Locked Focus" : "Current Focus"}</span>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="aurora-title-label text-[10px] tracking-[0.22em]">Selected Direction</p>
                <h3 className="aurora-title-primary mt-2 text-[1.4rem] leading-tight">
                  {focusCandidate.naming.recommended}
                </h3>
                <p className="mt-2 text-sm text-slate-300">{focusCandidate.moodboard.title}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="aurora-btn-secondary rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60"
                  onClick={() => onSelect(focusCandidate.id)}
                  disabled={busy}
                >
                  {selectedCandidateId === focusCandidate.id ? "Selected" : "Select This Direction"}
                </button>
                {buildRequired ? (
                  <button
                    className="aurora-btn-cta rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60"
                    onClick={onConfirmBuild}
                    disabled={busy}
                  >
                    Build
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="aurora-surface-soft rounded-[22px] p-4">
                <p className="aurora-title-label text-[10px] tracking-[0.2em]">Narrative</p>
                <p className="mt-3 text-sm text-slate-200">{focusCandidate.narrative_summary}</p>
                <p className="mt-3 text-sm text-slate-300">{focusCandidate.rationale}</p>
              </div>

              <div className="space-y-4">
                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">Palette</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {focusColors.map((color) => (
                      <span
                        key={color}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-200"
                      >
                        <span className="aurora-color-dot" style={{ backgroundColor: color, color }} />
                        {color}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="aurora-surface-soft rounded-[22px] p-4">
                  <p className="aurora-title-label text-[10px] tracking-[0.2em]">UI Plan</p>
                  <p className="mt-2 text-sm text-slate-200">{focusCandidate.ui_plan.headline}</p>
                  <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    {focusCandidate.ui_plan.layout.join(" / ")}
                  </p>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    CTA {focusCandidate.ui_plan.cta}
                  </p>
                </div>
              </div>
            </div>

            {buildRequired ? (
              <div className="rounded-[22px] border border-amber-200/30 bg-amber-300/8 px-4 py-3 text-sm text-amber-50">
                This direction is selected. Approve build when you are ready to generate the final outputs.
              </div>
            ) : (
              <div className="rounded-[22px] border border-indigo-200/18 bg-slate-950/24 px-4 py-3 text-sm text-slate-200">
                Select any alternative on the right if you want to change the locked route before build.
              </div>
            )}
          </div>
        </article>

        <div className="space-y-4">
          <div className="aurora-surface-soft rounded-[24px] p-4">
            <p className="aurora-title-label text-[10px] tracking-[0.2em]">Compare Alternatives</p>
            <p className="mt-2 text-sm text-slate-300">
              Keep the chosen route, or switch focus if one of these alternatives resolves the brief better.
            </p>
          </div>

          {comparisonCandidates.map((candidate) => {
            const asset = getTop3CardAsset(candidate.rank);
            const selected = candidate.id === selectedCandidateId;

            return (
              <article key={candidate.id} className={`aurora-panel overflow-hidden rounded-[24px] ${selected ? "aurora-candidate-card is-selected" : ""}`}>
                <div className="grid gap-0 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
                  <div className="aurora-candidate-media relative aspect-square sm:aspect-auto sm:h-full">
                    {candidate.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={candidate.image_url}
                        alt={`${candidate.naming.recommended} comparison concept`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Image
                        src={asset.image}
                        alt={`${asset.name} concept card`}
                        width={512}
                        height={512}
                        className="h-full w-full object-cover"
                        sizes="(min-width: 1280px) 18rem, 40vw"
                      />
                    )}
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="aurora-title-label text-[10px] tracking-[0.2em]">Option #{candidate.rank}</p>
                        <h4 className="aurora-title-primary mt-2 text-[1.08rem]">{candidate.naming.recommended}</h4>
                      </div>
                      <span className={selected ? "aurora-chip" : "aurora-chip-soft"}>{selected ? "Selected" : "Open"}</span>
                    </div>

                    <p className="line-clamp-3 text-sm text-slate-300">{candidate.narrative_summary}</p>

                    <button
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        selected ? "aurora-btn-command text-amber-50" : "aurora-btn-secondary"
                      }`}
                      onClick={() => onSelect(candidate.id)}
                      disabled={busy}
                    >
                      {selected ? "Selected Direction" : "Switch to This"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
