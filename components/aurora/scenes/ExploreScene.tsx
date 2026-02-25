"use client";

import { Top3Cards } from "../Top3Cards";
import type { Candidate } from "../types";

type ExploreSceneProps = {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  busy: boolean;
  onSelect: (candidateId: string) => void;
  onConfirmBuild: () => void;
};

export function ExploreScene({
  candidates,
  selectedCandidateId,
  busy,
  onSelect,
  onConfirmBuild
}: ExploreSceneProps) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-2xl border border-cyan-300/25 bg-slate-950/70 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-100">Generating Top-3...</p>
        <div className="mt-3 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-cyan-500/20" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-cyan-500/20" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-cyan-500/20" />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          For lower OpenAI spend in behavior tests, keep `AUTO_CONTINUE=false` and reduce `CANDIDATE_COUNT`.
        </p>
      </div>
    );
  }

  return (
    <Top3Cards
      candidates={candidates}
      selectedCandidateId={selectedCandidateId}
      busy={busy}
      buildRequired={false}
      onSelect={onSelect}
      onConfirmBuild={onConfirmBuild}
    />
  );
}
