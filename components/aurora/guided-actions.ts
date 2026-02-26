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
        : "Product, Audience, Style keywords를 먼저 입력하세요."
    };
    model.hint = "브리프 입력 후 세션을 시작하세요.";
    model.suggestedCommand = "/start";
    model.suggestedReason = "세션이 아직 시작되지 않았습니다.";
    return model;
  }

  if (input.buildConfirmRequired) {
    model.primaryAction = {
      id: "confirm_build",
      label: "Build"
    };
    model.secondaryAction = {
      id: "regenerate_top3",
      label: "Regenerate Top-3"
    };
    model.hint = "Auto pick top-1이 꺼져 있어 Build 확인이 필요합니다.";
    model.suggestedCommand = "/build";
    model.suggestedReason = "approve_build 대기 상태입니다.";
    return model;
  }

  if (input.currentScene === "PACKAGE") {
    model.primaryAction = {
      id: "export_zip",
      label: "Export Zip",
      disabled: !input.packReady,
      disabledReason: input.packReady ? undefined : "패키지 생성이 완료되면 Export가 열립니다."
    };
    model.secondaryAction = {
      id: "regenerate_outputs",
      label: "Regenerate Outputs"
    };
    model.hint = "체크리스트를 확인하고 결과물을 내보내세요.";
    model.suggestedCommand = "/export";
    model.suggestedReason = input.packReady ? "패키지 내보내기가 가능합니다." : "패키지 준비가 완료되면 내보낼 수 있습니다.";
    return model;
  }

  if (input.currentScene === "EXPLORE") {
    if (input.top3Count === 0) {
      model.primaryAction = {
        id: "run_step",
        label: "Generate Top-3"
      };
      model.hint = "Top-3 후보를 생성해 DECIDE로 넘어갑니다.";
      model.suggestedCommand = "/run";
      model.suggestedReason = "Top-3가 아직 생성되지 않았습니다.";
      return model;
    }

    model.primaryAction = {
      id: "run_step",
      label: "Continue to DECIDE"
    };
    model.secondaryAction = {
      id: "regenerate_top3",
      label: "Regenerate Top-3"
    };
    model.hint = "후보가 준비되었습니다. 다음 씬으로 진행하세요.";
    model.suggestedCommand = "/run";
    model.suggestedReason = "EXPLORE에서 DECIDE로 진행합니다.";
    return model;
  }

  if (input.currentScene === "DECIDE") {
    if (input.top3Count === 0) {
      model.primaryAction = {
        id: "run_step",
        label: "Generate Top-3"
      };
      model.hint = "Top-3가 아직 없어 먼저 후보 생성이 필요합니다.";
      model.suggestedCommand = "/run";
      model.suggestedReason = "후보 생성이 먼저 필요합니다.";
      return model;
    }

    if (!input.selectedCandidateId && input.currentStep === "top3_select") {
      model.primaryAction = {
        id: "pick_1",
        label: "Pick #1"
      };
      model.secondaryAction = {
        id: "pick_2",
        label: "Pick #2"
      };
      model.hint = "후보를 선택하면 Build 단계로 이동합니다.";
      model.suggestedCommand = "/pick 1";
      model.suggestedReason = "후보 선택 대기 상태입니다.";
      return model;
    }

    model.primaryAction = {
      id: "run_step",
      label: input.status === "wait_user" ? "Continue DECIDE" : "Continue"
    };
    model.secondaryAction = {
      id: "regenerate_top3",
      label: "Regenerate Top-3"
    };
    model.hint = "선택을 확정하고 PACKAGE 씬으로 진행하세요.";
    model.suggestedCommand = "/run";
    model.suggestedReason = "선택 이후 다음 단계로 진행합니다.";
    return model;
  }

  model.primaryAction = {
    id: "run_step",
    label: "Continue DEFINE"
  };
  model.secondaryAction = {
    id: "run_step",
    label: "Run Step"
  };

  if (input.shouldQueueIntervention) {
    model.hint = "현재 작업 중입니다. Chat 입력은 다음 stage에서 반영됩니다.";
    model.suggestedCommand = "/tone calmer";
    model.suggestedReason = "수정 지시는 queued로 안전하게 적재됩니다.";
  } else {
    model.hint = "DEFINE 정보를 정리하고 EXPLORE로 이동하세요.";
    model.suggestedCommand = "/run";
    model.suggestedReason = "DEFINE 단계에서 다음 stage 실행이 필요합니다.";
  }
  return model;
}
