import type { RightPanelViewModel, Scene } from "./types";

type ResolveGuidedActionInput = {
  sessionId: string | null;
  status: string;
  currentScene: Scene;
  currentStep: string;
  top3Count: number;
  selectedCandidateId: string | null;
  buildConfirmRequired: boolean;
  runtimeGoalId: string | null;
  packReady: boolean;
  shouldQueueIntervention: boolean;
  canStartSession: boolean;
  defineReadyForConcepts: boolean;
  defineFollowupQuestion: string | null;
};

export function resolveGuidedActionViewModel(input: ResolveGuidedActionInput): RightPanelViewModel {
  const model: RightPanelViewModel = {
    status: input.status,
    modelSource: "UNKNOWN",
    primaryAction: null,
    secondaryAction: null,
    hint: "",
    suggestedCommand: "/help",
    suggestedReason: "",
    showRuntimeGroup: input.status === "wait_user" || Boolean(input.runtimeGoalId),
    hasRuntimeGoal: Boolean(input.runtimeGoalId)
  };

  if (!input.sessionId) {
    model.primaryAction = {
      id: "start_session",
      label: "Start Session",
      disabled: !input.canStartSession,
      disabledReason: input.canStartSession
        ? undefined
        : "Product, Audience, Style keywords, Design requirement, Q0를 먼저 입력하세요. (/setup ... 가능)"
    };
    model.hint = "브리프 입력 후 세션을 시작하세요. 시작 직후 Aurora가 direction을 정리합니다.";
    model.suggestedCommand = input.canStartSession ? "/start" : "/setup note keep serif headline hierarchy";
    model.suggestedReason = input.canStartSession
      ? "세션을 시작하면 direction synthesis가 바로 실행됩니다."
      : "세션 시작 전에 note를 포함한 setup 값을 먼저 채우세요.";
    return model;
  }

  if (input.buildConfirmRequired) {
    model.primaryAction = {
      id: "confirm_build",
      label: "Build"
    };
    model.secondaryAction = {
      id: "regenerate_top3",
      label: "Regenerate 3 Concepts"
    };
    model.hint = "선택된 direction을 확정하고 build-ready outputs를 생성하세요.";
    model.suggestedCommand = "/build";
    model.suggestedReason = "approve_build 대기 상태입니다.";
    return model;
  }

  if (input.currentScene === "PACKAGE") {
    model.primaryAction = {
      id: "export_zip",
      label: "Export Pack",
      disabled: !input.packReady,
      disabledReason: input.packReady ? undefined : "패키지 생성이 완료되면 Export가 열립니다."
    };
    model.secondaryAction = {
      id: "regenerate_outputs",
      label: "Regenerate Outputs"
    };
    model.hint = "전략과 산출물을 확인하고 패키지로 내보내세요.";
    model.suggestedCommand = "/export";
    model.suggestedReason = input.packReady ? "패키지 내보내기가 가능합니다." : "패키지 준비가 완료되면 내보낼 수 있습니다.";
    return model;
  }

  if (input.currentScene === "EXPLORE") {
    if (input.top3Count === 0) {
      model.primaryAction = {
        id: "run_step",
        label: "Generate Concepts"
      };
      model.hint = "현재 direction을 기준으로 primary concept image + supporting asset bundle 3개를 생성합니다.";
      model.suggestedCommand = "/run";
      model.suggestedReason = "후보 3개가 아직 생성되지 않았습니다.";
      return model;
    }

    model.secondaryAction = {
      id: "regenerate_top3",
      label: "Regenerate 3 Concepts"
    };
    model.hint = "후보가 준비되었습니다. 좌측 카드에서 하나를 선택해 direction을 잠그세요.";
    model.suggestedCommand = "/pick 1";
    model.suggestedReason = "EXPLORE에서 후보 하나를 선택하면 DECIDE로 넘어갑니다.";
    return model;
  }

  if (input.currentScene === "DECIDE") {
    if (input.top3Count === 0) {
      model.primaryAction = {
        id: "run_step",
        label: "Generate Concepts"
      };
      model.hint = "Top-3가 아직 없어 먼저 후보 생성이 필요합니다.";
      model.suggestedCommand = "/run";
      model.suggestedReason = "후보 생성이 먼저 필요합니다.";
      return model;
    }

    if (!input.selectedCandidateId) {
      model.primaryAction = null;
      model.secondaryAction = null;
      model.hint =
        input.currentStep === "approve_build"
          ? "선택한 direction을 잠그는 중입니다. 잠시 후 Build가 열립니다. 오래 유지되면 좌측에서 다시 선택하세요."
          : "후보를 먼저 하나 선택해 direction을 잠그세요.";
      model.suggestedCommand = "/pick 1";
      model.suggestedReason =
        input.currentStep === "approve_build"
          ? "선택 반영이 지연될 때만 다시 선택하면 됩니다."
          : "후보 선택이 완료되면 Build 단계로 넘어갑니다.";
      return model;
    }

    model.primaryAction = {
      id: "confirm_build",
      label: "Build"
    };
    model.secondaryAction = {
      id: "regenerate_top3",
      label: "Regenerate 3 Concepts"
    };
    model.hint = "선택을 확정했다면 바로 Build로 넘기고 PACKAGE 씬으로 진행하세요.";
    model.suggestedCommand = "/build";
    model.suggestedReason = "선택안이 있으면 첫 Build 클릭에서 approve_build를 직접 실행합니다.";
    return model;
  }

  if (!input.defineReadyForConcepts) {
    model.primaryAction = null;
    model.secondaryAction = null;
    model.hint = "Aurora still needs one clearer answer before concept generation.";
    model.suggestedCommand = "/help";
    model.suggestedReason = input.defineFollowupQuestion ?? "Reply in chat to clarify what you are building and who it is for.";
    return model;
  }

  model.primaryAction = {
    id: "run_step",
    label: "Generate Concepts"
  };
  model.secondaryAction = null;

  if (input.shouldQueueIntervention) {
    model.hint = "현재 작업 중입니다. Chat 입력은 다음 stage에서 반영됩니다.";
    model.suggestedCommand = "Reply in chat";
    model.suggestedReason = "수정 지시는 자연어로 보내면 queued로 안전하게 적재됩니다.";
  } else {
    model.hint = "Direction을 정리한 뒤 concept generation으로 넘어가세요.";
    model.suggestedCommand = "/run";
    model.suggestedReason = "현재 direction으로 3개 후보를 생성할 수 있습니다.";
  }
  return model;
}
