import { randomUUID } from "crypto";
import { runAgentPipeline } from "../agent/orchestrator";
import type { RunStepResponse, SessionRecord } from "../agent/types";
import type { StorageRepository } from "../storage/types";
import type { RuntimeActionSpec, RuntimeGoalRecord } from "./types";

const OUTPUT_KINDS = ["tokens", "social_assets", "code_plan", "validation"] as const;

function hasOutputKinds(kindList: string[]): boolean {
  return OUTPUT_KINDS.every((requiredKind) => kindList.includes(requiredKind));
}

function getSafeInputValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  return value as T;
}

async function withSingleStepMode<T>(
  storage: StorageRepository,
  sessionId: string,
  fn: () => Promise<T>
): Promise<T> {
  const session = await storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  const originalAuto = session.auto_continue;
  if (originalAuto) {
    await storage.updateSession(sessionId, { auto_continue: false });
  }
  try {
    return await fn();
  } finally {
    const latest = await storage.getSession(sessionId);
    if (latest && latest.auto_continue !== originalAuto) {
      await storage.updateSession(sessionId, { auto_continue: originalAuto });
    }
  }
}

async function runSinglePipelineStep(input: {
  storage: StorageRepository;
  session: SessionRecord;
  step?: RunStepResponse["current_step"];
  action?: string;
  payload?: Record<string, unknown>;
}): Promise<RunStepResponse> {
  return withSingleStepMode(input.storage, input.session.id, async () => {
    return runAgentPipeline({
      storage: input.storage,
      request: {
        session_id: input.session.id,
        step: input.step,
        action: input.action,
        payload: input.payload,
        idempotency_key: randomUUID()
      }
    });
  });
}

export interface RuntimeToolExecutionResult {
  ok: boolean;
  message: string;
  run_response: RunStepResponse | null;
  output: Record<string, unknown>;
}

export async function executeRuntimeTool(input: {
  storage: StorageRepository;
  goal: RuntimeGoalRecord;
  action: RuntimeActionSpec;
}): Promise<RuntimeToolExecutionResult> {
  const session = await input.storage.getSession(input.goal.session_id);
  if (!session) {
    return {
      ok: false,
      message: "Session not found for runtime tool execution.",
      run_response: null,
      output: {
        session_id: input.goal.session_id
      }
    };
  }

  const artifacts = await input.storage.listArtifactsBySession(session.id);
  const artifactKinds = artifacts.map((artifact) => artifact.kind);

  if (input.action.tool_name === "tool.session.observe") {
    const jobs = await input.storage.listJobsBySession(session.id);
    return {
      ok: true,
      message: "Observed current session state.",
      run_response: null,
      output: {
        session_id: session.id,
        current_step: session.current_step,
        status: session.status,
        top3_count: session.latest_top3?.length ?? 0,
        selected_candidate_id: session.selected_candidate_id,
        artifact_count: artifacts.length,
        job_count: jobs.length
      }
    };
  }

  if (input.action.tool_name === "tool.brand.ensure_direction") {
    const directionReady =
      session.current_step === "brand_narrative" &&
      session.status === "wait_user" &&
      Boolean(session.draft_spec?.direction);
    if (directionReady) {
      return {
        ok: true,
        message: "Direction already synthesized.",
        run_response: null,
        output: {
          current_step: session.current_step,
          direction_ready: true
        }
      };
    }

    const response = await runAgentPipeline({
      storage: input.storage,
      request: {
        session_id: session.id,
        step: "interview_collect",
        payload: {
          bootstrap_until_direction: true
        },
        idempotency_key: randomUUID()
      }
    });
    const refreshed = await input.storage.getSession(session.id);
    return {
      ok: response.status !== "failed",
      message: "Direction bootstrap executed.",
      run_response: response,
      output: {
        current_step: refreshed?.current_step ?? response.current_step,
        wait_user: response.wait_user,
        direction_ready: Boolean(refreshed?.draft_spec?.direction)
      }
    };
  }

  if (input.action.tool_name === "tool.brand.ensure_top3") {
    if ((session.latest_top3?.length ?? 0) >= 3) {
      return {
        ok: true,
        message: "Top-3 already available.",
        run_response: null,
        output: {
          top3_count: session.latest_top3?.length ?? 0,
          current_step: session.current_step
        }
      };
    }

    let workingSession = session;
    if (!workingSession.draft_spec?.direction || workingSession.current_step === "interview_collect" || workingSession.current_step === "intent_gate" || workingSession.current_step === "spec_draft") {
      await runAgentPipeline({
        storage: input.storage,
        request: {
          session_id: session.id,
          step: "interview_collect",
          payload: {
            bootstrap_until_direction: true
          },
          idempotency_key: randomUUID()
        }
      });
      workingSession = (await input.storage.getSession(session.id)) ?? session;
    }

    if ((workingSession.latest_top3?.length ?? 0) >= 3) {
      return {
        ok: true,
        message: "Top-3 already available.",
        run_response: null,
        output: {
          top3_count: workingSession.latest_top3?.length ?? 0,
          current_step: workingSession.current_step
        }
      };
    }

    let step = workingSession.current_step;
    if (step === "brand_narrative") {
      step = "candidates_generate";
    }
    if (step === "top3_select" || step === "approve_build" || step === "package" || step === "done") {
      step = "candidates_generate";
    }

    const response = await runSinglePipelineStep({
      storage: input.storage,
      session: workingSession,
      step
    });
    const refreshed = await input.storage.getSession(session.id);
    return {
      ok: response.status !== "failed",
      message: "Top-3 progression executed.",
      run_response: response,
      output: {
        top3_count: refreshed?.latest_top3?.length ?? response.latest_top3?.length ?? 0,
        current_step: refreshed?.current_step ?? response.current_step,
        wait_user: response.wait_user
      }
    };
  }

  if (input.action.tool_name === "tool.brand.ensure_selection") {
    if (session.selected_candidate_id) {
      return {
        ok: true,
        message: "Candidate already selected.",
        run_response: null,
        output: {
          selected_candidate_id: session.selected_candidate_id
        }
      };
    }

    const payloadCandidateId = getSafeInputValue<string | null>(input.action.input.candidate_id, null);
    const response = await runSinglePipelineStep({
      storage: input.storage,
      session,
      step: "top3_select",
      payload: payloadCandidateId
        ? {
            candidate_id: payloadCandidateId
          }
        : undefined
    });
    const refreshed = await input.storage.getSession(session.id);
    return {
      ok: response.status !== "failed",
      message: "Selection step executed.",
      run_response: response,
      output: {
        selected_candidate_id: refreshed?.selected_candidate_id ?? response.selected_candidate_id,
        current_step: refreshed?.current_step ?? response.current_step,
        wait_user: response.wait_user
      }
    };
  }

  if (input.action.tool_name === "tool.brand.ensure_outputs") {
    if (hasOutputKinds(artifactKinds)) {
      return {
        ok: true,
        message: "Output artifacts already generated.",
        run_response: null,
        output: {
          output_kinds: artifactKinds.filter((kind) => OUTPUT_KINDS.includes(kind as (typeof OUTPUT_KINDS)[number]))
        }
      };
    }

    const response = await runSinglePipelineStep({
      storage: input.storage,
      session,
      step: "approve_build"
    });
    const refreshedArtifacts = await input.storage.listArtifactsBySession(session.id);
    return {
      ok: response.status !== "failed",
      message: "Build output step executed.",
      run_response: response,
      output: {
        output_kinds: refreshedArtifacts
          .map((artifact) => artifact.kind)
          .filter((kind) => OUTPUT_KINDS.includes(kind as (typeof OUTPUT_KINDS)[number])),
        current_step: response.current_step,
        wait_user: response.wait_user
      }
    };
  }

  if (input.action.tool_name === "tool.brand.ensure_package") {
    if (session.current_step === "done" && artifactKinds.includes("pack_meta")) {
      return {
        ok: true,
        message: "Pack already available.",
        run_response: null,
        output: {
          current_step: session.current_step
        }
      };
    }

    const response = await runSinglePipelineStep({
      storage: input.storage,
      session,
      step: "package"
    });
    const refreshed = await input.storage.getSession(session.id);
    return {
      ok: response.status !== "failed",
      message: "Package step executed.",
      run_response: response,
      output: {
        current_step: refreshed?.current_step ?? response.current_step,
        status: refreshed?.status ?? response.status,
        wait_user: response.wait_user
      }
    };
  }

  if (input.action.tool_name === "tool.chat.apply_override") {
    const actionType = getSafeInputValue<string>(input.action.input.action_type, "unknown");
    const payload = getSafeInputValue<Record<string, unknown> | undefined>(
      input.action.input.payload,
      undefined
    );
    const response = await runSinglePipelineStep({
      storage: input.storage,
      session,
      action: actionType,
      payload
    });
    const refreshed = await input.storage.getSession(session.id);
    return {
      ok: response.status !== "failed",
      message: "Chat override action executed.",
      run_response: response,
      output: {
        action_type: actionType,
        current_step: refreshed?.current_step ?? response.current_step,
        status: refreshed?.status ?? response.status,
        wait_user: response.wait_user
      }
    };
  }

  return {
    ok: false,
    message: `Unknown tool: ${input.action.tool_name}`,
    run_response: null,
    output: {
      tool_name: input.action.tool_name
    }
  };
}
