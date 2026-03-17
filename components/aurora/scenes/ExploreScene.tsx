"use client";

import { Top3Cards } from "../Top3Cards";
import type { Candidate, ImagePreviewPayload, ModelSource } from "../types";

type ExploreSceneProps = {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  modelSource: ModelSource;
  busy: boolean;
  onPreviewImage: (image: ImagePreviewPayload) => void;
  onSelect: (candidateId: string) => void;
  onConfirmBuild: () => void;
};

export function ExploreScene({
  candidates,
  selectedCandidateId,
  modelSource,
  busy,
  onPreviewImage,
  onSelect,
  onConfirmBuild
}: ExploreSceneProps) {
  const modelBadgeClass =
    modelSource === "OPENAI"
      ? "border-indigo-200/50 bg-indigo-400/18 text-indigo-50"
      : modelSource === "MOCK"
        ? "border-slate-500/50 bg-slate-700/30 text-slate-100"
        : "border-indigo-200/24 bg-slate-900/70 text-slate-300";

  if (candidates.length === 0) {
    return (
      <div className="aurora-panel rounded-[28px] p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="aurora-title-label text-[10px] tracking-[0.22em]">Explore</p>
            <p className="mt-2 text-sm text-slate-200">Generating the top-three concept field.</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${modelBadgeClass}`}>
            {modelSource}
          </span>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-indigo-500/24" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-indigo-500/24" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-indigo-500/24" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="aurora-title-primary text-[1.28rem]">Compare the three story-and-asset bundles Aurora generated.</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            Each concept combines one primary image, three supporting assets, and a short narrative so you can judge the
            brand direction as a complete bundle.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${modelBadgeClass}`}>
          {modelSource}
        </span>
      </div>
      <Top3Cards
        candidates={candidates}
        selectedCandidateId={selectedCandidateId}
        busy={busy}
        buildRequired={false}
        preferChatCommands
        onPreviewImage={onPreviewImage}
        onSelect={onSelect}
        onConfirmBuild={onConfirmBuild}
      />
    </div>
  );
}
