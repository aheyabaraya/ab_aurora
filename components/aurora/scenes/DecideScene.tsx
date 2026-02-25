"use client";

import { Top3Cards } from "../Top3Cards";
import type { Candidate } from "../types";

type DecideSceneProps = {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  busy: boolean;
  buildRequired: boolean;
  onSelect: (candidateId: string) => void;
  onConfirmBuild: () => void;
};

export function DecideScene({
  candidates,
  selectedCandidateId,
  busy,
  buildRequired,
  onSelect,
  onConfirmBuild
}: DecideSceneProps) {
  return (
    <Top3Cards
      candidates={candidates}
      selectedCandidateId={selectedCandidateId}
      busy={busy}
      buildRequired={buildRequired}
      onSelect={onSelect}
      onConfirmBuild={onConfirmBuild}
    />
  );
}
