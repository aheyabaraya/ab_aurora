import { randomUUID } from "crypto";
import type { StorageRepository } from "../storage/types";
import { env } from "../env";
import { evaluateRuntimeProgress } from "./evaluator";
import { buildBrandKey, collectRuntimeMemory, writeRuntimeMemory } from "./memory";
import { planRuntimeStep } from "./planner";
import { evaluateRuntimePolicy } from "./policy";
import { recordRuntimeEvent } from "./trace";
import { executeRuntimeTool } from "./tool-registry";
import type {
  RuntimeActionRecord,
  RuntimeActionSpec,
  RuntimeEvalRecord,
  RuntimeGoalRecord,
  RuntimeGoalType,
  RuntimePlanRecord
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function toOverrideSpec(input: {
  sessionId: string;
  actionType: string;
  payload?: Record<string, unknown>;
}): RuntimeActionSpec {
  return {
    action_type: "apply_override",
    tool_name: "tool.chat.apply_override",
    input: {
      session_id: input.sessionId,
      action_type: input.actionType,
      payload: input.payload ?? {}
    },
    reason: "User-provided override action"
  };
}

function toLegacyStepSpec(input: {
  sessionId: string;
  step?: string;
}): RuntimeActionSpec | null {
  if (!input.step) {
    return null;
  }
  if (input.step === "brand_narrative" || input.step === "candidates_generate") {
    return {
      action_type: "ensure_top3",
      tool_name: "tool.brand.ensure_top3",
      input: { session_id: input.sessionId },
      reason: "Legacy step mapped to ensure_top3"
    };
  }
  if (input.step === "top3_select") {
    return {
      action_type: "ensure_selection",
      tool_name: "tool.brand.ensure_selection",
      input: { session_id: input.sessionId },
      reason: "Legacy step mapped to ensure_selection"
    };
  }
  if (input.step === "approve_build") {
    return {
      action_type: "ensure_outputs",
      tool_name: "tool.brand.ensure_outputs",
      input: { session_id: input.sessionId },
      reason: "Legacy step mapped to ensure_outputs"
    };
  }
  if (input.step === "package" || input.step === "done") {
    return {
      action_type: "ensure_package",
      tool_name: "tool.brand.ensure_package",
      input: { session_id: input.sessionId },
      reason: "Legacy step mapped to ensure_package"
    };
  }
  return null;
}

async function getLatestPlan(storage: StorageRepository, goalId: string): Promise<RuntimePlanRecord | null> {
  const plans = await storage.listRuntimePlansByGoal(goalId);
  return plans.length > 0 ? plans[0] : null;
}

async function getLatestAction(storage: StorageRepository, goalId: string): Promise<RuntimeActionRecord | null> {
  const actions = await storage.listRuntimeActionsByGoal(goalId);
  return actions.length > 0 ? actions[0] : null;
}

async function getEvalById(
  storage: StorageRepository,
  goalId: string,
  evalId: string | null
): Promise<RuntimeEvalRecord | null> {
  if (!evalId) {
    return null;
  }
  const evaluations = await storage.listRuntimeEvalsByGoal(goalId);
  return evaluations.find((evaluation) => evaluation.id === evalId) ?? null;
}

async function executeRuntimeToolWithTimeout(input: {
  storage: StorageRepository;
  goal: RuntimeGoalRecord;
  action: RuntimeActionSpec;
}): Promise<Awaited<ReturnType<typeof executeRuntimeTool>>> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      executeRuntimeTool({
        storage: input.storage,
        goal: input.goal,
        action: input.action
      }),
      new Promise<Awaited<ReturnType<typeof executeRuntimeTool>>>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({
            ok: false,
            message: `Tool execution timed out after ${env.RUNTIME_TOOL_TIMEOUT_MS}ms.`,
            run_response: null,
            output: {
              timeout_ms: env.RUNTIME_TOOL_TIMEOUT_MS,
              tool_name: input.action.tool_name
            }
          });
        }, env.RUNTIME_TOOL_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function startRuntimeGoal(input: {
  storage: StorageRepository;
  session_id: string;
  goal_type: RuntimeGoalType;
  goal_input?: Record<string, unknown>;
  idempotency_key?: string;
}): Promise<{
  goal: RuntimeGoalRecord;
  initial_plan: RuntimePlanRecord;
  current_action: RuntimeActionSpec | null;
}> {
  const session = await input.storage.getSession(input.session_id);
  if (!session) {
    throw new Error(`Session not found: ${input.session_id}`);
  }

  if (input.idempotency_key) {
    const existing = await input.storage.findRuntimeGoalByIdempotency(input.idempotency_key);
    if (existing) {
      const existingPlan = await getLatestPlan(input.storage, existing.id);
      if (existingPlan) {
        return {
          goal: existing,
          initial_plan: existingPlan,
          current_action: existingPlan.proposed_actions[0] ?? null
        };
      }
    }
  }

  const active = await input.storage.findActiveRuntimeGoal(input.session_id, input.goal_type);
  if (active) {
    const activePlan = await getLatestPlan(input.storage, active.id);
    if (activePlan) {
      return {
        goal: active,
        initial_plan: activePlan,
        current_action: activePlan.proposed_actions[0] ?? null
      };
    }
  }

  const goal = await input.storage.createRuntimeGoal({
    session_id: input.session_id,
    goal_type: input.goal_type,
    goal_input: input.goal_input ?? null,
    idempotency_key: input.idempotency_key ?? null
  });

  await recordRuntimeEvent({
    storage: input.storage,
    session_id: goal.session_id,
    goal_id: goal.id,
    event_type: "goal_created",
    payload: {
      goal_type: goal.goal_type
    }
  });

  const artifacts = await input.storage.listArtifactsBySession(session.id);
  const memoryBundle = await collectRuntimeMemory({
    storage: input.storage,
    session
  });
  const planned = planRuntimeStep({
    session,
    artifacts,
    memories: memoryBundle.memories
  });

  const initialPlan = await input.storage.createRuntimePlan({
    goal_id: goal.id,
    version: 1,
    rationale: planned.rationale,
    proposed_actions: planned.proposed_actions,
    stop_condition: planned.stop_condition,
    status: "active"
  });

  const updatedGoal = await input.storage.updateRuntimeGoal(goal.id, {
    status: "running",
    current_plan_id: initialPlan.id,
    current_step_no: 0,
    error: null
  });

  await recordRuntimeEvent({
    storage: input.storage,
    session_id: updatedGoal.session_id,
    goal_id: updatedGoal.id,
    event_type: "plan_created",
    payload: {
      plan_id: initialPlan.id,
      version: initialPlan.version
    }
  });

  return {
    goal: updatedGoal,
    initial_plan: initialPlan,
    current_action: planned.next_action
  };
}

export async function stepRuntimeGoal(input: {
  storage: StorageRepository;
  goal_id: string;
  force_replan?: boolean;
  action_override?: {
    action_type: string;
    payload?: Record<string, unknown>;
  };
  idempotency_key?: string;
}): Promise<{
  goal: RuntimeGoalRecord;
  goal_status: RuntimeGoalRecord["status"];
  current_step_no: number;
  last_action: RuntimeActionRecord | null;
  eval: RuntimeEvalRecord | null;
  next_action: RuntimeActionSpec | null;
  wait_user: boolean;
  message: string;
}> {
  let goal = await input.storage.getRuntimeGoal(input.goal_id);
  if (!goal) {
    throw new Error(`Runtime goal not found: ${input.goal_id}`);
  }

  if (input.idempotency_key && !input.force_replan) {
    const existingAction = await input.storage.getRuntimeActionByIdempotency(goal.id, input.idempotency_key);
    if (existingAction) {
      const evalRecord = await getEvalById(input.storage, goal.id, goal.last_eval_id);
      const session = await input.storage.getSession(goal.session_id);
      const artifacts = session ? await input.storage.listArtifactsBySession(session.id) : [];
      const memoryBundle = session
        ? await collectRuntimeMemory({ storage: input.storage, session })
        : { brandKey: "", memories: [] };
      const planned = session
        ? planRuntimeStep({
            session,
            artifacts,
            memories: memoryBundle.memories
          })
        : { rationale: "Session missing.", stop_condition: "session_missing", next_action: null, proposed_actions: [] };
      return {
        goal,
        goal_status: goal.status,
        current_step_no: goal.current_step_no,
        last_action: existingAction,
        eval: evalRecord,
        next_action: planned.next_action,
        wait_user: goal.status === "wait_user",
        message: "Idempotent runtime step replayed."
      };
    }
  }

  if (goal.status === "completed" || goal.status === "failed" || goal.status === "canceled") {
    const lastAction = await getLatestAction(input.storage, goal.id);
    const evalRecord = await getEvalById(input.storage, goal.id, goal.last_eval_id);
    return {
      goal,
      goal_status: goal.status,
      current_step_no: goal.current_step_no,
      last_action: lastAction,
      eval: evalRecord,
      next_action: null,
      wait_user: false,
      message: "Goal is already terminal."
    };
  }

  let iteration = 0;
  let replanCount = 0;
  let lastAction: RuntimeActionRecord | null = null;
  let lastEval: RuntimeEvalRecord | null = null;
  let nextAction: RuntimeActionSpec | null = null;
  let waitUser = false;
  let message = "Runtime step completed.";

  while (iteration < env.RUNTIME_MAX_ITERATIONS) {
    iteration += 1;
    const session = await input.storage.getSession(goal.session_id);
    if (!session) {
      goal = await input.storage.updateRuntimeGoal(goal.id, {
        status: "failed",
        error: "Session was removed during runtime execution."
      });
      await recordRuntimeEvent({
        storage: input.storage,
        session_id: goal.session_id,
        goal_id: goal.id,
        event_type: "goal_failed",
        payload: {
          reason: goal.error
        }
      });
      message = "Session was removed during runtime execution.";
      break;
    }

    const artifacts = await input.storage.listArtifactsBySession(session.id);
    const memoryBundle = await collectRuntimeMemory({
      storage: input.storage,
      session
    });

    const overrideSpec =
      iteration === 1 && input.action_override
        ? toOverrideSpec({
            sessionId: session.id,
            actionType: input.action_override.action_type,
            payload: input.action_override.payload
          })
        : null;

    const planned = planRuntimeStep({
      session,
      artifacts,
      memories: memoryBundle.memories,
      actionOverride: overrideSpec
    });

    nextAction = planned.next_action;

    const existingPlans = await input.storage.listRuntimePlansByGoal(goal.id);
    const planVersion = existingPlans.length > 0 ? existingPlans[0].version + 1 : 1;
    const plan = await input.storage.createRuntimePlan({
      goal_id: goal.id,
      version: planVersion,
      rationale: planned.rationale,
      proposed_actions: planned.proposed_actions,
      stop_condition: planned.stop_condition,
      status: "active"
    });

    goal = await input.storage.updateRuntimeGoal(goal.id, {
      status: "running",
      current_plan_id: plan.id,
      error: null
    });

    await recordRuntimeEvent({
      storage: input.storage,
      session_id: goal.session_id,
      goal_id: goal.id,
      event_type: "plan_created",
      payload: {
        plan_id: plan.id,
        version: plan.version,
        rationale: plan.rationale
      }
    });

    if (!nextAction) {
      const evaluation = evaluateRuntimeProgress({
        session,
        artifacts
      });
      lastEval = await input.storage.createRuntimeEval({
        goal_id: goal.id,
        plan_id: plan.id,
        action_id: null,
        scores: evaluation.scores,
        pass: evaluation.pass,
        reasons: evaluation.reasons,
        next_hint: evaluation.next_hint
      });

      goal = await input.storage.updateRuntimeGoal(goal.id, {
        status: evaluation.pass ? "completed" : session.status === "wait_user" ? "wait_user" : "running",
        last_eval_id: lastEval.id
      });
      waitUser = goal.status === "wait_user";
      message = evaluation.pass ? "Goal already satisfied." : "No executable action generated.";

      await recordRuntimeEvent({
        storage: input.storage,
        session_id: goal.session_id,
        goal_id: goal.id,
        event_type: "eval_recorded",
        payload: {
          eval_id: lastEval.id,
          pass: lastEval.pass
        }
      });

      if (goal.status === "completed") {
        await recordRuntimeEvent({
          storage: input.storage,
          session_id: goal.session_id,
          goal_id: goal.id,
          event_type: "goal_completed",
          payload: {
            eval_id: lastEval.id
          }
        });
      }
      break;
    }

    const stepNo = goal.current_step_no + 1;
    const action = await input.storage.createRuntimeAction({
      goal_id: goal.id,
      plan_id: plan.id,
      step_no: stepNo,
      action_type: nextAction.action_type,
      tool_name: nextAction.tool_name,
      action_input: nextAction.input,
      status: "running",
      idempotency_key: iteration === 1 ? input.idempotency_key ?? null : null
    });

    lastAction = action;
    goal = await input.storage.updateRuntimeGoal(goal.id, {
      current_step_no: stepNo,
      last_action_id: action.id,
      status: "running"
    });

    await recordRuntimeEvent({
      storage: input.storage,
      session_id: goal.session_id,
      goal_id: goal.id,
      event_type: "action_started",
      payload: {
        action_id: action.id,
        action_type: action.action_type,
        tool_name: action.tool_name
      }
    });

    const activeJobs = await input.storage.countActiveJobsBySession(session.id);
    const policy = evaluateRuntimePolicy({
      session,
      action: nextAction,
      activeJobs
    });

    if (policy.decision !== "allow") {
      lastAction = await input.storage.updateRuntimeAction(action.id, {
        status: policy.decision === "confirm_required" ? "confirm_required" : "denied",
        policy_result: policy.decision,
        output: {
          reason: policy.reason
        },
        error: policy.reason,
        finished_at: nowIso()
      });

      goal = await input.storage.updateRuntimeGoal(goal.id, {
        status: "wait_user",
        error: policy.reason,
        last_action_id: lastAction.id
      });
      waitUser = true;
      message = policy.reason;

      await recordRuntimeEvent({
        storage: input.storage,
        session_id: goal.session_id,
        goal_id: goal.id,
        event_type: "policy_denied",
        payload: {
          action_id: action.id,
          decision: policy.decision,
          reason: policy.reason
        }
      });
      await recordRuntimeEvent({
        storage: input.storage,
        session_id: goal.session_id,
        goal_id: goal.id,
        event_type: "goal_wait_user",
        payload: {
          reason: policy.reason
        }
      });
      break;
    }

    const startedAt = Date.now();
    const toolResult = await executeRuntimeToolWithTimeout({
      storage: input.storage,
      goal,
      action: nextAction
    });
    const latencyMs = Date.now() - startedAt;

    await input.storage.createRuntimeToolCall({
      goal_id: goal.id,
      action_id: action.id,
      tool_name: nextAction.tool_name,
      input: nextAction.input,
      output: {
        message: toolResult.message,
        ...toolResult.output,
        run_response: toolResult.run_response ?? null
      },
      status: toolResult.ok ? "completed" : "failed",
      latency_ms: latencyMs,
      error: toolResult.ok ? null : toolResult.message
    });

    if (!toolResult.ok) {
      lastAction = await input.storage.updateRuntimeAction(action.id, {
        status: "failed",
        policy_result: "allow",
        error: toolResult.message,
        output: {
          ...toolResult.output,
          run_response: toolResult.run_response ?? null
        },
        finished_at: nowIso()
      });

      await recordRuntimeEvent({
        storage: input.storage,
        session_id: goal.session_id,
        goal_id: goal.id,
        event_type: "action_failed",
        payload: {
          action_id: action.id,
          error: toolResult.message
        }
      });

      replanCount += 1;
      if (replanCount > env.RUNTIME_REPLAN_LIMIT) {
        goal = await input.storage.updateRuntimeGoal(goal.id, {
          status: "failed",
          error: toolResult.message,
          last_action_id: lastAction.id
        });
        message = toolResult.message;

        await recordRuntimeEvent({
          storage: input.storage,
          session_id: goal.session_id,
          goal_id: goal.id,
          event_type: "goal_failed",
          payload: {
            reason: toolResult.message,
            replan_count: replanCount
          }
        });
        break;
      }

      goal = await input.storage.updateRuntimeGoal(goal.id, {
        status: "running",
        error: toolResult.message,
        last_action_id: lastAction.id
      });
      message = `Action failed. Replanning (${replanCount}/${env.RUNTIME_REPLAN_LIMIT}).`;
      continue;
    }

    lastAction = await input.storage.updateRuntimeAction(action.id, {
      status: "completed",
      policy_result: "allow",
      error: null,
      output: {
        ...toolResult.output,
        run_response: toolResult.run_response ?? null
      },
      finished_at: nowIso()
    });

    await recordRuntimeEvent({
      storage: input.storage,
      session_id: goal.session_id,
      goal_id: goal.id,
      event_type: "action_completed",
      payload: {
        action_id: action.id,
        tool_name: action.tool_name
      }
    });

    const refreshedSession = await input.storage.getSession(goal.session_id);
    if (!refreshedSession) {
      goal = await input.storage.updateRuntimeGoal(goal.id, {
        status: "failed",
        error: "Session missing after action execution."
      });
      message = "Session missing after action execution.";
      break;
    }

    const refreshedArtifacts = await input.storage.listArtifactsBySession(refreshedSession.id);
    const evaluation = evaluateRuntimeProgress({
      session: refreshedSession,
      artifacts: refreshedArtifacts
    });

    lastEval = await input.storage.createRuntimeEval({
      goal_id: goal.id,
      plan_id: plan.id,
      action_id: action.id,
      scores: evaluation.scores,
      pass: evaluation.pass,
      reasons: evaluation.reasons,
      next_hint: evaluation.next_hint
    });

    await recordRuntimeEvent({
      storage: input.storage,
      session_id: goal.session_id,
      goal_id: goal.id,
      event_type: "eval_recorded",
      payload: {
        eval_id: lastEval.id,
        pass: lastEval.pass,
        next_hint: lastEval.next_hint
      }
    });

    goal = await input.storage.updateRuntimeGoal(goal.id, {
      last_action_id: action.id,
      last_eval_id: lastEval.id,
      status: evaluation.pass ? "completed" : refreshedSession.status === "wait_user" ? "wait_user" : "running",
      error: evaluation.pass ? null : evaluation.reasons.join(" ")
    });

    await writeRuntimeMemory({
      storage: input.storage,
      session: refreshedSession,
      action: lastAction,
      evaluation: lastEval
    });

    await recordRuntimeEvent({
      storage: input.storage,
      session_id: goal.session_id,
      goal_id: goal.id,
      event_type: "memory_updated",
      payload: {
        action_id: action.id,
        eval_id: lastEval.id
      }
    });

    if (goal.status === "completed") {
      message = "Runtime goal satisfied.";
      await recordRuntimeEvent({
        storage: input.storage,
        session_id: goal.session_id,
        goal_id: goal.id,
        event_type: "goal_completed",
        payload: {
          action_id: action.id,
          eval_id: lastEval.id
        }
      });
      break;
    }

    if (goal.status === "wait_user") {
      waitUser = true;
      message = evaluation.reasons[0] ?? "User action required.";
      await recordRuntimeEvent({
        storage: input.storage,
        session_id: goal.session_id,
        goal_id: goal.id,
        event_type: "goal_wait_user",
        payload: {
          action_id: action.id,
          eval_id: lastEval.id
        }
      });
      break;
    }

    message = evaluation.reasons[0] ?? "Runtime loop progressed.";
  }

  if (iteration >= env.RUNTIME_MAX_ITERATIONS && goal.status === "running") {
    goal = await input.storage.updateRuntimeGoal(goal.id, {
      status: "wait_user",
      error: `Runtime max iterations reached (${env.RUNTIME_MAX_ITERATIONS}).`
    });
    waitUser = true;
    message = `Runtime max iterations reached (${env.RUNTIME_MAX_ITERATIONS}).`;
  }

  const session = await input.storage.getSession(goal.session_id);
  if (session) {
    const artifacts = await input.storage.listArtifactsBySession(session.id);
    const memoryBundle = await collectRuntimeMemory({ storage: input.storage, session });
    const nextPlan = planRuntimeStep({
      session,
      artifacts,
      memories: memoryBundle.memories
    });
    nextAction = nextPlan.next_action;
  }

  return {
    goal,
    goal_status: goal.status,
    current_step_no: goal.current_step_no,
    last_action: lastAction,
    eval: lastEval,
    next_action: nextAction,
    wait_user: waitUser || goal.status === "wait_user",
    message
  };
}

export async function getRuntimeGoalSnapshot(input: {
  storage: StorageRepository;
  goal_id: string;
}): Promise<{
  goal: RuntimeGoalRecord;
  plans: RuntimePlanRecord[];
  actions: RuntimeActionRecord[];
  evals: RuntimeEvalRecord[];
  memories: Awaited<ReturnType<StorageRepository["listRuntimeMemories"]>>;
  events: Awaited<ReturnType<StorageRepository["listRuntimeEventsByGoal"]>>;
  tool_calls: Awaited<ReturnType<StorageRepository["listRuntimeToolCallsByGoal"]>>;
} | null> {
  const goal = await input.storage.getRuntimeGoal(input.goal_id);
  if (!goal) {
    return null;
  }

  const session = await input.storage.getSession(goal.session_id);
  let memories = await input.storage.listRuntimeMemories({
    scope: "session",
    session_id: goal.session_id
  });

  if (session && env.RUNTIME_MEMORY_PERSIST) {
    const brandKey = buildBrandKey(session);
    const brandMemories = await input.storage.listRuntimeMemories({
      scope: "brand",
      brand_key: brandKey
    });
    memories = [...memories, ...brandMemories];
  }

  const [plans, actions, evals, events, toolCalls] = await Promise.all([
    input.storage.listRuntimePlansByGoal(goal.id),
    input.storage.listRuntimeActionsByGoal(goal.id),
    input.storage.listRuntimeEvalsByGoal(goal.id),
    input.storage.listRuntimeEventsByGoal(goal.id),
    input.storage.listRuntimeToolCallsByGoal(goal.id)
  ]);

  return {
    goal,
    plans,
    actions,
    evals,
    memories,
    events,
    tool_calls: toolCalls
  };
}

export async function ensureRuntimeGoalForSession(input: {
  storage: StorageRepository;
  session_id: string;
  goal_input?: Record<string, unknown>;
  idempotency_key?: string;
}): Promise<RuntimeGoalRecord> {
  const active = await input.storage.findActiveRuntimeGoal(input.session_id, "deliver_demo_pack");
  if (active) {
    return active;
  }
  const started = await startRuntimeGoal({
    storage: input.storage,
    session_id: input.session_id,
    goal_type: "deliver_demo_pack",
    goal_input: input.goal_input,
    idempotency_key: input.idempotency_key
  });
  return started.goal;
}

export function toRuntimeActionOverrideFromLegacy(input: {
  session_id: string;
  action?: string;
  payload?: Record<string, unknown>;
  step?: string;
}): RuntimeActionSpec | null {
  if (input.action) {
    return toOverrideSpec({
      sessionId: input.session_id,
      actionType: input.action,
      payload: input.payload
    });
  }

  return toLegacyStepSpec({
    sessionId: input.session_id,
    step: input.step
  });
}

export function buildRuntimeStartIdempotency(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
