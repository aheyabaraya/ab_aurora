import type { ArtifactRecord, SessionRecord } from "../agent/types";
import type { RuntimeMemoryRecord, RuntimePlanResult, RuntimeActionSpec } from "./types";

const OUTPUT_KINDS: ArtifactRecord["kind"][] = [
  "tokens",
  "social_assets",
  "code_plan",
  "validation"
];

function hasArtifactKind(artifacts: ArtifactRecord[], kind: ArtifactRecord["kind"]): boolean {
  return artifacts.some((artifact) => artifact.kind === kind);
}

function hasTop3(session: SessionRecord): boolean {
  return Array.isArray(session.latest_top3) && session.latest_top3.length >= 3;
}

function hasSelection(session: SessionRecord): boolean {
  return typeof session.selected_candidate_id === "string" && session.selected_candidate_id.length > 0;
}

function hasOutputs(artifacts: ArtifactRecord[]): boolean {
  return OUTPUT_KINDS.every((kind) => hasArtifactKind(artifacts, kind));
}

function hasPack(artifacts: ArtifactRecord[]): boolean {
  return hasArtifactKind(artifacts, "pack_meta");
}

function buildActionSpec(
  actionType: string,
  toolName: string,
  input: Record<string, unknown>,
  reason: string
): RuntimeActionSpec {
  return {
    action_type: actionType,
    tool_name: toolName,
    input,
    reason
  };
}

export function planRuntimeStep(input: {
  session: SessionRecord;
  artifacts: ArtifactRecord[];
  memories: RuntimeMemoryRecord[];
  actionOverride?: RuntimeActionSpec | null;
}): RuntimePlanResult {
  const { session, artifacts, actionOverride } = input;

  if (actionOverride) {
    return {
      rationale: "User override is prioritized for this cycle.",
      stop_condition: "manual_override_applied",
      next_action: actionOverride,
      proposed_actions: [actionOverride]
    };
  }

  const top3Ready = hasTop3(session);
  const selectionReady = hasSelection(session);
  const outputsReady = hasOutputs(artifacts);
  const packReady = hasPack(artifacts);
  const doneReady = session.current_step === "done";

  const proposed: RuntimeActionSpec[] = [];
  if (!top3Ready) {
    proposed.push(
      buildActionSpec(
        "ensure_top3",
        "tool.brand.ensure_top3",
        { session_id: session.id },
        "Top-3 candidates are missing."
      )
    );
  }
  if (!selectionReady) {
    proposed.push(
      buildActionSpec(
        "ensure_selection",
        "tool.brand.ensure_selection",
        { session_id: session.id },
        "A candidate selection is required before build outputs."
      )
    );
  }
  if (!outputsReady) {
    proposed.push(
      buildActionSpec(
        "ensure_outputs",
        "tool.brand.ensure_outputs",
        { session_id: session.id },
        "Core output artifacts are incomplete."
      )
    );
  }
  if (!packReady || !doneReady) {
    proposed.push(
      buildActionSpec(
        "ensure_package",
        "tool.brand.ensure_package",
        { session_id: session.id },
        "Packaging must finish to complete the goal."
      )
    );
  }

  if (proposed.length === 0) {
    return {
      rationale: "Goal is already satisfied: done step with packaged artifact.",
      stop_condition: "done_with_pack",
      next_action: null,
      proposed_actions: []
    };
  }

  return {
    rationale: "Rule-first planner selected the highest-priority missing stage.",
    stop_condition: "done_with_pack",
    next_action: proposed[0],
    proposed_actions: proposed
  };
}
