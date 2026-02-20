import { env } from "../env";
import type { ArtifactRecord, SessionRecord } from "../agent/types";
import type { RuntimeEvalResult } from "./types";

const OUTPUT_KINDS: ArtifactRecord["kind"][] = [
  "tokens",
  "social_assets",
  "code_plan",
  "validation"
];

function hasArtifactKind(artifacts: ArtifactRecord[], kind: ArtifactRecord["kind"]): boolean {
  return artifacts.some((artifact) => artifact.kind === kind);
}

export function evaluateRuntimeProgress(input: {
  session: SessionRecord;
  artifacts: ArtifactRecord[];
}): RuntimeEvalResult {
  const top3Ready = Array.isArray(input.session.latest_top3) && input.session.latest_top3.length >= 3;
  const selectedReady = Boolean(input.session.selected_candidate_id);
  const outputsReady = OUTPUT_KINDS.every((kind) => hasArtifactKind(input.artifacts, kind));
  const packReady = hasArtifactKind(input.artifacts, "pack_meta");
  const doneReady = input.session.current_step === "done";

  const scores = {
    top3: top3Ready ? 1 : 0,
    selection: selectedReady ? 1 : 0,
    outputs: outputsReady ? 1 : 0,
    package: packReady ? 1 : 0,
    done: doneReady ? 1 : 0
  };

  const goalFit =
    scores.top3 * 0.2 +
    scores.selection * 0.2 +
    scores.outputs * 0.25 +
    scores.package * 0.2 +
    scores.done * 0.15;

  const reasons: string[] = [];
  if (!top3Ready) {
    reasons.push("Top-3 candidates are not ready.");
  }
  if (!selectedReady) {
    reasons.push("Selected candidate is missing.");
  }
  if (!outputsReady) {
    reasons.push("Output artifacts are incomplete.");
  }
  if (!packReady) {
    reasons.push("Pack artifact is missing.");
  }
  if (!doneReady) {
    reasons.push("Session has not reached done step.");
  }

  const pass = goalFit >= env.RUNTIME_EVAL_MIN_SCORE && top3Ready && selectedReady && outputsReady && packReady && doneReady;

  let nextHint: string | null = null;
  if (!top3Ready) {
    nextHint = "ensure_top3";
  } else if (!selectedReady) {
    nextHint = "ensure_selection";
  } else if (!outputsReady) {
    nextHint = "ensure_outputs";
  } else if (!packReady || !doneReady) {
    nextHint = "ensure_package";
  }

  return {
    scores: {
      ...scores,
      goal_fit: Number(goalFit.toFixed(3))
    },
    pass,
    reasons: pass ? ["Goal criteria satisfied."] : reasons,
    next_hint: nextHint
  };
}
