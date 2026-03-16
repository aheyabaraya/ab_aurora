import type { BrandDirection, BrandSpecDraft, BrandSpecFinal } from "../brand-spec.schema";

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

export type SessionMode = "mode_a" | "mode_b";

export type VariationWidth = "wide" | "medium" | "narrow";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "canceled";

export type ArtifactKind =
  | "interview"
  | "clarify_questions"
  | "brand_spec_draft"
  | "brand_narrative"
  | "candidates_top3"
  | "selection"
  | "tokens"
  | "social_assets"
  | "code_plan"
  | "validation"
  | "pack_meta"
  | "followup_asset"
  | "chat_action";

export interface SupportingAsset {
  id: string;
  kind: string;
  title: string;
  prompt: string;
  image_url: string;
}

export interface CandidateStory {
  premise: string;
  narrative: string;
  asset_rationale: string;
}

export interface Candidate {
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
  supporting_assets: SupportingAsset[];
  story: CandidateStory;
  revision_basis?: string | null;
}

export type { BrandDirection };

export interface DirectionClarity {
  score: number;
  ready_for_concepts: boolean;
  summary: string;
  missing_inputs: string[];
  followup_questions: string[];
}

export interface SessionRecord {
  id: string;
  owner_user_id: string | null;
  mode: SessionMode;
  product: string;
  audience: string;
  style_keywords: string[];
  constraint: string | null;
  current_step: AgentStep;
  status: AgentStatus;
  auto_continue: boolean;
  auto_pick_top1: boolean;
  paused: boolean;
  intent_confidence: number | null;
  variation_width: VariationWidth | null;
  latest_top3: Candidate[] | null;
  selected_candidate_id: string | null;
  draft_spec: BrandSpecDraft | null;
  final_spec: BrandSpecFinal | null;
  revision_count: number;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface JobRecord {
  id: string;
  session_id: string;
  step: AgentStep;
  status: JobStatus;
  payload: Record<string, unknown> | null;
  logs: string[];
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArtifactRecord {
  id: string;
  session_id: string;
  job_id: string | null;
  step: AgentStep;
  kind: ArtifactKind;
  title: string;
  content: Record<string, unknown>;
  hash: string;
  created_at: string;
}

export interface PackRecord {
  id: string;
  session_id: string;
  meta: Record<string, unknown>;
  bundle_hash: string;
  cid: string | null;
  mint_tx: string | null;
  created_at: string;
}

export type ChatActionType =
  | "refine_direction"
  | "revise_constraint"
  | "rerun_candidates"
  | "select_candidate"
  | "proceed"
  | "pause"
  | "resume"
  | "generate_followup_asset"
  | "unknown";

export interface ChatAction {
  type: ChatActionType;
  payload?: Record<string, unknown>;
  raw: string;
}

export interface RunStepRequest {
  session_id: string;
  step?: AgentStep;
  action?: ChatActionType | string;
  payload?: Record<string, unknown>;
  idempotency_key: string;
}

export interface RunStepResponse {
  status: AgentStatus;
  current_step: AgentStep;
  next_step: AgentStep | null;
  wait_user: boolean;
  job_id: string | null;
  artifacts: ArtifactRecord[];
  selected_candidate_id: string | null;
  latest_top3: Candidate[] | null;
  message: string;
  runtime_meta?: {
    enabled: boolean;
    goal_id?: string;
    goal_status?: string;
    current_step_no?: number;
    eval?: Record<string, unknown> | null;
  };
}
