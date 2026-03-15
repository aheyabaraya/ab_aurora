export const AGENT_STEPS = [
  "interview_collect",
  "intent_gate",
  "spec_draft",
  "brand_narrative",
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
  brand_narrative: "DEFINE",
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
  narrative_summary: string;
  image_prompt: string;
  image_url: string;
  revision_basis?: string | null;
};

export type DirectionRecord = {
  brief_summary: string;
  brand_promise: string;
  audience_tension: string;
  narrative_summary: string;
  voice_principles: string[];
  anti_goals: string[];
  visual_principles: string[];
  image_intent: string;
  prompt_seed: string;
  next_question: string;
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

export type SessionUsageSummary = {
  total: number;
  by_type: Record<string, number>;
};

export type SessionPayload = {
  session: {
    id: string;
    mode: "mode_a" | "mode_b";
    product: string;
    audience: string;
    style_keywords: string[];
    constraint?: string | null;
    current_step: string;
    status: AgentStatus;
    auto_continue: boolean;
    auto_pick_top1: boolean;
    selected_candidate_id: string | null;
    intent_confidence: number | null;
    variation_width: "wide" | "medium" | "narrow" | null;
    draft_spec?: {
      direction?: DirectionRecord | null;
    } | null;
    final_spec?: Record<string, unknown> | null;
  };
  latest_top3: Candidate[] | null;
  selected_candidate_id: string | null;
  recent_artifacts: ArtifactRecord[];
  recent_messages: SessionMessage[];
  usage_summary?: SessionUsageSummary;
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
  imageUrl?: string;
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

export type GuidedActionId =
  | "start_session"
  | "run_step"
  | "confirm_build"
  | "regenerate_top3"
  | "regenerate_outputs"
  | "export_zip"
  | "start_runtime_goal"
  | "runtime_step"
  | "pause_runtime"
  | "resume_runtime"
  | "force_replan"
  | "pick_1"
  | "pick_2"
  | "pick_3";

export type ModelSource = "OPENAI" | "MOCK" | "UNKNOWN";

export type SlashCommandCategory = "pipeline" | "tone" | "runtime" | "session" | "utility";

export type SlashCommandId =
  | GuidedActionId
  | "setup_brief"
  | "tone_editorial"
  | "tone_calmer"
  | "tone_ritual"
  | "tone_less_futuristic"
  | "help";

export type SlashCommandSpec = {
  id: SlashCommandId;
  category: SlashCommandCategory;
  canonical: string;
  aliasesKo: string[];
  help: string;
  requiresSession?: boolean;
  requiresRuntimeGoal?: boolean;
  queueable?: boolean;
};

export type CommandExecutionResult = {
  accepted: boolean;
  kind: "slash" | "chat";
  commandId?: SlashCommandId;
  message?: string;
  rateLimited?: boolean;
  assistantSource?: "openai" | "rate_limited" | "fallback";
};

export type ActionHubAction = {
  id: GuidedActionId;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
};

export type RightPanelViewModel = {
  status: AgentStatus | string;
  modelSource: ModelSource;
  primaryAction: ActionHubAction | null;
  secondaryAction: ActionHubAction | null;
  hint: string;
  suggestedCommand: string;
  suggestedReason: string;
  showRuntimeGroup: boolean;
  hasRuntimeGoal: boolean;
};
