"use client";

import { Top3Cards } from "../Top3Cards";
import type { Candidate, ModelSource } from "../types";

type ExploreSceneProps = {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  modelSource: ModelSource;
  busy: boolean;
  onSelect: (candidateId: string) => void;
  onConfirmBuild: () => void;
};

export function ExploreScene({
  candidates,
  selectedCandidateId,
  modelSource,
  busy,
  onSelect,
  onConfirmBuild
}: ExploreSceneProps) {
  const modelBadgeClass =
    modelSource === "OPENAI"
      ? "border-indigo-200/70 bg-indigo-400/20 text-indigo-50"
      : modelSource === "MOCK"
        ? "border-slate-500 bg-slate-700/40 text-slate-200"
        : "border-indigo-200/24 bg-slate-900/70 text-slate-400";

  if (candidates.length === 0) {
    return (
      <div className="aurora-panel rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="aurora-title-label text-xs uppercase tracking-[0.2em]">Generating Top-3...</p>
          <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${modelBadgeClass}`}>
            {modelSource}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-indigo-500/24" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-indigo-500/24" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-indigo-500/24" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${modelBadgeClass}`}>
          {modelSource}
        </span>
      </div>
      <Top3Cards
        candidates={candidates}
        selectedCandidateId={selectedCandidateId}
        busy={busy}
        buildRequired={false}
        preferChatCommands
        onSelect={onSelect}
        onConfirmBuild={onConfirmBuild}
      />
    </div>
  );
}
