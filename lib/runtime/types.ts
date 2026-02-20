export type RuntimeGoalType = "deliver_demo_pack";

export type RuntimeGoalStatus =
  | "pending"
  | "running"
  | "wait_user"
  | "completed"
  | "failed"
  | "canceled";

export type RuntimePlanStatus = "active" | "superseded" | "completed" | "failed";

export type RuntimePolicyDecision = "allow" | "deny" | "confirm_required";

export type RuntimeActionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "denied"
  | "confirm_required";

export type RuntimeToolCallStatus = "completed" | "failed";

export type RuntimeMemoryScope = "session" | "brand";

export type RuntimeEventType =
  | "goal_created"
  | "plan_created"
  | "action_started"
  | "action_completed"
  | "action_failed"
  | "policy_denied"
  | "eval_recorded"
  | "memory_updated"
  | "goal_completed"
  | "goal_wait_user"
  | "goal_failed";

export interface RuntimeActionSpec {
  action_type: string;
  tool_name: string;
  input: Record<string, unknown>;
  reason: string;
}

export interface RuntimeGoalRecord {
  id: string;
  session_id: string;
  goal_type: RuntimeGoalType;
  goal_input: Record<string, unknown> | null;
  status: RuntimeGoalStatus;
  current_plan_id: string | null;
  current_step_no: number;
  last_action_id: string | null;
  last_eval_id: string | null;
  idempotency_key: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface RuntimePlanRecord {
  id: string;
  goal_id: string;
  version: number;
  rationale: string;
  proposed_actions: RuntimeActionSpec[];
  stop_condition: string;
  status: RuntimePlanStatus;
  created_at: string;
  updated_at: string;
}

export interface RuntimeActionRecord {
  id: string;
  goal_id: string;
  plan_id: string | null;
  step_no: number;
  action_type: string;
  tool_name: string;
  action_input: Record<string, unknown>;
  policy_result: RuntimePolicyDecision | null;
  status: RuntimeActionStatus;
  idempotency_key: string | null;
  output: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface RuntimeToolCallRecord {
  id: string;
  goal_id: string;
  action_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: RuntimeToolCallStatus;
  latency_ms: number;
  error: string | null;
  created_at: string;
}

export interface RuntimeEvalRecord {
  id: string;
  goal_id: string;
  plan_id: string | null;
  action_id: string | null;
  scores: Record<string, number>;
  pass: boolean;
  reasons: string[];
  next_hint: string | null;
  created_at: string;
}

export interface RuntimeMemoryRecord {
  id: string;
  scope: RuntimeMemoryScope;
  session_id: string | null;
  brand_key: string | null;
  memory_key: string;
  memory_value: Record<string, unknown>;
  weight: number;
  source_action_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RuntimeEventRecord {
  id: string;
  session_id: string;
  goal_id: string;
  event_type: RuntimeEventType;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface RuntimePlanInput {
  goal_id: string;
  version: number;
  rationale: string;
  proposed_actions: RuntimeActionSpec[];
  stop_condition: string;
  status?: RuntimePlanStatus;
}

export interface RuntimeActionInput {
  goal_id: string;
  plan_id: string | null;
  step_no: number;
  action_type: string;
  tool_name: string;
  action_input: Record<string, unknown>;
  policy_result?: RuntimePolicyDecision | null;
  status?: RuntimeActionStatus;
  idempotency_key?: string | null;
}

export interface RuntimeToolCallInput {
  goal_id: string;
  action_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: RuntimeToolCallStatus;
  latency_ms: number;
  error: string | null;
}

export interface RuntimePlanResult {
  rationale: string;
  stop_condition: string;
  next_action: RuntimeActionSpec | null;
  proposed_actions: RuntimeActionSpec[];
}

export interface RuntimePolicyResult {
  decision: RuntimePolicyDecision;
  reason: string;
}

export interface RuntimeEvalResult {
  scores: Record<string, number>;
  pass: boolean;
  reasons: string[];
  next_hint: string | null;
}
