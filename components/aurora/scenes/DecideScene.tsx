"use client";

import { Top3Cards } from "../Top3Cards";
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

export function DecideScene({
  candidates,
  selectedCandidateId,
  modelSource,
  busy,
  buildRequired,
  onSelect,
  onConfirmBuild
}: DecideSceneProps) {
  const modelBadgeClass =
    modelSource === "OPENAI"
      ? "border-indigo-200/50 bg-indigo-400/18 text-indigo-50"
      : modelSource === "MOCK"
        ? "border-slate-500/50 bg-slate-700/30 text-slate-100"
        : "border-indigo-200/24 bg-slate-900/70 text-slate-300";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="aurora-title-primary text-[1.28rem]">Lock one concept and approve the build path.</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${modelBadgeClass}`}>
          {modelSource}
        </span>
      </div>
      <Top3Cards
        candidates={candidates}
        selectedCandidateId={selectedCandidateId}
        busy={busy}
        buildRequired={buildRequired}
        preferChatCommands
        onSelect={onSelect}
        onConfirmBuild={onConfirmBuild}
      />
    </div>
  );
}
