export const AGENT_STEPS = [
  "interview_collect",
  "intent_gate",
  "spec_draft",
  "candidates_generate",
  "top3_select",
  "approve_build",
  "package",
  "done"
] as const;

export type AgentStep = (typeof AGENT_STEPS)[number];

export type AgentStatus = "idle" | "running" | "wait_user" | "failed" | "completed";

export type Scene = "DEFINE" | "EXPLORE" | "DECIDE" | "PACKAGE";

export const SCENE_ORDER: Scene[] = ["DEFINE", "EXPLORE", "DECIDE", "PACKAGE"];

export const STAGE_TO_SCENE: Record<AgentStep, Scene> = {
  interview_collect: "DEFINE",
  intent_gate: "DEFINE",
  spec_draft: "DEFINE",
  candidates_generate: "EXPLORE",
  top3_select: "DECIDE",
  approve_build: "DECIDE",
  package: "PACKAGE",
  done: "PACKAGE"
};

export function resolveSceneFromStep(step: string | null | undefined): Scene {
  if (!step) {
    return "DEFINE";
  }
  if (step in STAGE_TO_SCENE) {
    return STAGE_TO_SCENE[step as AgentStep];
  }
  return "DEFINE";
}

export type Candidate = {
  id: string;
  rank: number;
  score: number;
  naming: {
    recommended: string;
    candidates: string[];
  };
  moodboard: {
    title: string;
    prompt: string;
    colors: string[];
  };
  ui_plan: {
    headline: string;
    layout: string[];
    cta: string;
  };
  rationale: string;
};

export type SessionMessage = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type ArtifactRecord = {
  id: string;
  kind: string;
  title: string;
  created_at: string;
  content: Record<string, unknown>;
};

export type SessionPayload = {
  session: {
    id: string;
    mode: "mode_a" | "mode_b";
    product: string;
    audience: string;
    style_keywords: string[];
    current_step: string;
    status: AgentStatus;
    auto_continue: boolean;
    auto_pick_top1: boolean;
    selected_candidate_id: string | null;
    final_spec?: Record<string, unknown> | null;
  };
  latest_top3: Candidate[] | null;
  selected_candidate_id: string | null;
  recent_artifacts: ArtifactRecord[];
  recent_messages: SessionMessage[];
};

export type JobsPayload = {
  jobs: Array<{
    id: string;
    step: string;
    status: string;
    error: string | null;
    created_at: string;
  }>;
};

export type RuntimeGoalSnapshot = {
  goal: {
    id: string;
    status: string;
    current_step_no: number;
    error: string | null;
  };
  actions: Array<{
    id: string;
    action_type: string;
    tool_name: string;
    status: string;
    created_at: string;
  }>;
  evals: Array<{
    id: string;
    pass: boolean;
    scores: Record<string, number>;
    next_hint: string | null;
    created_at: string;
  }>;
};

export type ChatEntryType = "user" | "assistant" | "system" | "artifact-note";

export type ChatEntry = {
  id: string;
  type: ChatEntryType;
  content: string;
  createdAt: string;
  subtitle?: string;
};

export type QueuedCommand = {
  id: string;
  kind: "chat" | "revise";
  payload: string;
  label: string;
  createdAt: string;
};

export type QuickActionId =
  | "pick_1"
  | "pick_2"
  | "pick_3"
  | "regenerate_top3"
  | "more_editorial"
  | "reduce_futuristic"
  | "calmer"
  | "more_ritual"
  | "lock_style";
