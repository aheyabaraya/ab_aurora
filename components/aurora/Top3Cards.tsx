"use client";

import Image from "next/image";
import { getTop3CardAsset } from "./aurora-assets";
import type { Candidate } from "./types";

type Top3CardsProps = {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  busy: boolean;
  buildRequired: boolean;
  preferChatCommands?: boolean;
  onSelect: (candidateId: string) => void;
  onConfirmBuild: () => void;
};

export function Top3Cards({
  candidates,
  selectedCandidateId,
  busy,
  buildRequired,
  preferChatCommands = false,
  onSelect,
  onConfirmBuild
}: Top3CardsProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-3">
        {candidates.slice(0, 3).map((candidate) => {
          const selected = candidate.id === selectedCandidateId;
          const asset = getTop3CardAsset(candidate.rank);
          const colors = candidate.moodboard.colors.slice(0, 3);

          return (
            <article
              key={candidate.id}
              className={`aurora-panel aurora-candidate-card overflow-hidden rounded-[28px] ${
                selected ? "is-selected" : ""
              }`}
            >
              <div className="aurora-candidate-media relative aspect-[4/3] w-full">
                <div
                  className="absolute inset-0 bg-cover bg-center blur-[1px]"
                  style={{ backgroundImage: `url(${asset.blur})` }}
                  aria-hidden
                />
                {candidate.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={candidate.image_url}
                    alt={`${candidate.naming.recommended} concept render`}
                    className="relative h-full w-full object-cover"
                  />
                ) : (
                  <Image
                    src={asset.image}
                    alt={`${asset.name} concept card`}
                    width={768}
                    height={1024}
                    className="relative h-full w-full object-cover"
                    sizes="(min-width: 1024px) 23vw, (min-width: 768px) 32vw, 100vw"
                    priority={candidate.rank === 1}
                  />
                )}

                <div className="absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-2">
                  <span className="aurora-chip">#{candidate.rank}</span>
                  <span className="aurora-chip-soft">Score {candidate.score.toFixed(3)}</span>
                </div>
              </div>

              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="aurora-title-label text-[10px] tracking-[0.22em]">Concept</p>
                    <h3 className="aurora-title-primary mt-2 text-[1.14rem] leading-tight">{candidate.naming.recommended}</h3>
                    <p className="mt-1.5 text-sm text-slate-300">{candidate.moodboard.title}</p>
                  </div>
                  <span className={selected ? "aurora-chip" : "aurora-chip-soft"}>{selected ? "Selected" : "Open"}</span>
                </div>

                <p className="line-clamp-3 text-sm text-slate-200">{candidate.narrative_summary}</p>

                <div className="grid gap-3 md:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
                  <div className="aurora-surface-soft rounded-[18px] p-3">
                    <p className="aurora-title-label text-[10px] tracking-[0.2em]">Palette</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {colors.length > 0 ? (
                        colors.map((color) => (
                          <span
                            key={color}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-200"
                          >
                            <span className="aurora-color-dot" style={{ backgroundColor: color, color }} />
                            {color}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">Palette is still being refined.</span>
                      )}
                    </div>
                  </div>

                  <div className="aurora-surface-soft rounded-[18px] p-3">
                    <p className="aurora-title-label text-[10px] tracking-[0.2em]">UI Plan</p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-200">{candidate.ui_plan.headline}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                      CTA {candidate.ui_plan.cta}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="line-clamp-2 text-[11px] text-slate-400">
                    {preferChatCommands ? `You can also use /pick ${candidate.rank}.` : candidate.rationale}
                  </p>
                  <button
                    className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                      selected ? "aurora-btn-command text-amber-50" : "aurora-btn-secondary"
                    }`}
                    onClick={() => onSelect(candidate.id)}
                    disabled={busy}
                  >
                    {selected ? "Selected Direction" : "Select Direction"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {buildRequired ? (
        <div className="aurora-panel rounded-[26px] border-amber-200/36 bg-amber-300/6 p-4 text-sm text-amber-100">
          <p className="aurora-title-label text-[10px] tracking-[0.22em]">Build Confirmation</p>
          <p className="mt-2 text-sm text-amber-50/90">
            {preferChatCommands
              ? "Auto pick is off. Use /build in chat to confirm approve_build once."
              : "Auto pick is off. Confirm once to run approve_build and move to package."}
          </p>
          <button
            className="aurora-btn-cta mt-4 rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-60"
            onClick={onConfirmBuild}
            disabled={busy}
          >
            Build
          </button>
        </div>
      ) : null}
    </div>
  );
}
