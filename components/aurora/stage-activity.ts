import type { AgentStep, JobsPayload, SessionPayload, StageActivity } from "./types";

const ACTIVE_JOB_STATUSES = new Set(["pending", "running"]);

const STEP_ACTIVITY_MESSAGE: Record<string, string> = {
  interview_collect: "Aurora is still shaping the direction from the brief.",
  intent_gate: "Aurora is checking whether the current brief is strong enough to continue.",
  spec_draft: "Aurora is drafting the working direction for this brief.",
  brand_narrative: "Aurora is refining the current direction before concept generation.",
  candidates_generate: "Aurora is generating the 3 concept bundles for EXPLORE.",
  top3_select: "Aurora is syncing the selected concept route.",
  approve_build: "Aurora is building the final outputs for the selected route.",
  package: "Aurora is packaging the current output set."
};

function latestActiveJob(jobsPayload: JobsPayload | null) {
  const activeJobs = (jobsPayload?.jobs ?? []).filter((job) => ACTIVE_JOB_STATUSES.has(job.status));
  if (activeJobs.length === 0) {
    return null;
  }

  return [...activeJobs].sort((left, right) => {
    const leftTime = new Date(left.updated_at ?? left.created_at).getTime();
    const rightTime = new Date(right.updated_at ?? right.created_at).getTime();
    return rightTime - leftTime;
  })[0];
}

export function buildProcessingStageMessage(activeStep: string | null, currentStep: string | null | undefined): string {
  if (activeStep && STEP_ACTIVITY_MESSAGE[activeStep]) {
    return STEP_ACTIVITY_MESSAGE[activeStep];
  }
  if (currentStep && STEP_ACTIVITY_MESSAGE[currentStep]) {
    return STEP_ACTIVITY_MESSAGE[currentStep];
  }
  return "Aurora is processing the current stage.";
}

export function resolveStageActivity(input: {
  sessionPayload: SessionPayload | null;
  jobsPayload: JobsPayload | null;
}): StageActivity {
  const currentStep = input.sessionPayload?.session.current_step;
  const sessionStatus = input.sessionPayload?.session.status;
  const activeJob = latestActiveJob(input.jobsPayload);

  if (activeJob) {
    return {
      state: "active",
      canRun: false,
      shouldQueue: true,
      activeStep: activeJob.step,
      message: buildProcessingStageMessage(activeJob.step, currentStep),
      needsRefresh: false
    };
  }

  if (sessionStatus === "running") {
    return {
      state: "stale_running",
      canRun: false,
      shouldQueue: false,
      activeStep: currentStep ?? null,
      message: "Aurora is re-syncing this stage. One refresh check will run before the next action.",
      needsRefresh: true
    };
  }

  return {
    state: "idle",
    canRun: true,
    shouldQueue: false,
    activeStep: null,
    message: "",
    needsRefresh: false
  };
}

export function blocksRequestedRun(activeStep: string | null, requestedStep: AgentStep | null): boolean {
  if (!activeStep || !requestedStep) {
    return false;
  }

  if (requestedStep === "candidates_generate") {
    return activeStep === "candidates_generate" || activeStep === "approve_build" || activeStep === "package";
  }

  if (requestedStep === "approve_build") {
    return activeStep === "approve_build" || activeStep === "package" || activeStep === "candidates_generate";
  }

  if (requestedStep === "package") {
    return activeStep === "approve_build" || activeStep === "package";
  }

  return true;
}
