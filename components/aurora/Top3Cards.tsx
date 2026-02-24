"use client";

import Image from "next/image";
import { getTop3CardAsset } from "./aurora-assets";
import type { Candidate } from "./types";

type Top3CardsProps = {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  busy: boolean;
  buildRequired: boolean;
  onSelect: (candidateId: string) => void;
  onConfirmBuild: () => void;
};

export function Top3Cards({
  candidates,
  selectedCandidateId,
  busy,
  buildRequired,
  onSelect,
  onConfirmBuild
}: Top3CardsProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {candidates.slice(0, 3).map((candidate) => {
          const selected = candidate.id === selectedCandidateId;
          const asset = getTop3CardAsset(candidate.rank);
          return (
            <article
              key={candidate.id}
              className={`overflow-hidden rounded-2xl border ${
                selected
                  ? "border-amber-300/70 bg-slate-950/80 shadow-[0_0_24px_rgba(251,191,36,0.22)]"
                  : "border-cyan-300/20 bg-slate-950/65"
              }`}
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden">
                <div
                  className="absolute inset-0 bg-cover bg-center blur-[1px]"
                  style={{ backgroundImage: `url(${asset.blur})` }}
                  aria-hidden
                />
                <Image
                  src={asset.image}
                  alt={`${asset.name} concept card`}
                  width={768}
                  height={1024}
                  className="relative h-full w-full object-cover"
                  sizes="(min-width: 1024px) 23vw, (min-width: 768px) 32vw, 100vw"
                  priority={candidate.rank === 1}
                />
              </div>

              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Rank #{candidate.rank}</p>
                  <p className="text-[11px] text-slate-400">Score {candidate.score.toFixed(3)}</p>
                </div>
                <h3 className="text-sm font-semibold text-cyan-100">{candidate.naming.recommended}</h3>
                <p className="line-clamp-3 text-xs text-slate-300">{candidate.rationale}</p>
                <button
                  className={`w-full rounded-md border px-3 py-2 text-xs font-semibold transition ${
                    selected
                      ? "border-amber-300/80 bg-amber-300/15 text-amber-100"
                      : "border-cyan-300/40 text-cyan-100 hover:bg-cyan-400/10"
                  }`}
                  onClick={() => onSelect(candidate.id)}
                  disabled={busy}
                >
                  {selected ? "Selected" : "Select Candidate"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {buildRequired ? (
        <div className="rounded-xl border border-amber-300/50 bg-amber-400/10 p-3 text-sm text-amber-100">
          <p className="mb-2 text-xs uppercase tracking-[0.2em]">Build Confirmation</p>
          <p className="mb-3 text-xs text-amber-50/90">
            Auto pick is off. Confirm once to run approve_build and move to package.
          </p>
          <button
            className="rounded-lg border border-amber-300/80 bg-amber-300/20 px-4 py-2 text-xs font-semibold text-amber-50 hover:bg-amber-300/30 disabled:opacity-60"
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
