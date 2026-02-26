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
      ? "border-indigo-200/70 bg-indigo-400/20 text-indigo-50"
      : modelSource === "MOCK"
        ? "border-slate-500 bg-slate-700/40 text-slate-200"
        : "border-indigo-200/24 bg-slate-900/70 text-slate-400";

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
        buildRequired={buildRequired}
        preferChatCommands
        onSelect={onSelect}
        onConfirmBuild={onConfirmBuild}
      />
    </div>
  );
}
