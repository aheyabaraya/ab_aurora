import type { SlashCommandId, SlashCommandSpec } from "./types";

export const SLASH_COMMANDS: SlashCommandSpec[] = [
  {
    id: "start_session",
    category: "session",
    canonical: "/start",
    aliasesKo: ["/시작"],
    help: "Start a new session from the current brief."
  },
  {
    id: "run_step",
    category: "pipeline",
    canonical: "/run",
    aliasesKo: ["/진행"],
    help: "Run the next stage."
  },
  {
    id: "confirm_build",
    category: "pipeline",
    canonical: "/build",
    aliasesKo: ["/빌드", "/승인"],
    help: "Confirm build when approve step is waiting.",
    requiresSession: true
  },
  {
    id: "pick_1",
    category: "pipeline",
    canonical: "/pick 1",
    aliasesKo: ["/선택 1"],
    help: "Select candidate #1.",
    requiresSession: true,
    queueable: true
  },
  {
    id: "pick_2",
    category: "pipeline",
    canonical: "/pick 2",
    aliasesKo: ["/선택 2"],
    help: "Select candidate #2.",
    requiresSession: true,
    queueable: true
  },
  {
    id: "pick_3",
    category: "pipeline",
    canonical: "/pick 3",
    aliasesKo: ["/선택 3"],
    help: "Select candidate #3.",
    requiresSession: true,
    queueable: true
  },
  {
    id: "regenerate_top3",
    category: "pipeline",
    canonical: "/regen top3",
    aliasesKo: ["/재생성 top3", "/재생성 top-3"],
    help: "Regenerate Top-3 candidates.",
    requiresSession: true,
    queueable: true
  },
  {
    id: "regenerate_outputs",
    category: "pipeline",
    canonical: "/regen outputs",
    aliasesKo: ["/재생성 outputs", "/재생성 산출물"],
    help: "Regenerate package outputs from selected candidate.",
    requiresSession: true
  },
  {
    id: "export_zip",
    category: "pipeline",
    canonical: "/export",
    aliasesKo: ["/내보내기"],
    help: "Export pack zip.",
    requiresSession: true
  },
  {
    id: "tone_editorial",
    category: "tone",
    canonical: "/tone editorial",
    aliasesKo: ["/톤 에디토리얼"],
    help: "Make style more editorial.",
    requiresSession: true,
    queueable: true
  },
  {
    id: "tone_less_futuristic",
    category: "tone",
    canonical: "/tone less-futuristic",
    aliasesKo: ["/톤 미래감축소"],
    help: "Reduce futuristic accents.",
    requiresSession: true,
    queueable: true
  },
  {
    id: "tone_calmer",
    category: "tone",
    canonical: "/tone calmer",
    aliasesKo: ["/톤 차분하게"],
    help: "Make the direction calmer.",
    requiresSession: true,
    queueable: true
  },
  {
    id: "tone_ritual",
    category: "tone",
    canonical: "/tone ritual",
    aliasesKo: ["/톤 리추얼"],
    help: "Increase ritual mood.",
    requiresSession: true,
    queueable: true
  },
  {
    id: "help",
    category: "utility",
    canonical: "/help",
    aliasesKo: ["/도움말"],
    help: "Show slash command help."
  }
];

export type ParsedSlashCommand = {
  id: SlashCommandId;
  input: string;
  spec: SlashCommandSpec;
};

function toLower(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function expandAliases(spec: SlashCommandSpec): string[] {
  return [spec.canonical, ...spec.aliasesKo].map(toLower);
}

export function filterSlashCommands(query: string): SlashCommandSpec[] {
  const normalized = toLower(query);
  if (!normalized.startsWith("/")) {
    return [];
  }

  if (normalized === "/") {
    return SLASH_COMMANDS;
  }

  return SLASH_COMMANDS.filter((spec) => {
    return expandAliases(spec).some((alias) => alias.includes(normalized));
  });
}

export function parseSlashCommand(raw: string): ParsedSlashCommand | null {
  const normalized = toLower(raw);
  if (!normalized.startsWith("/")) {
    return null;
  }

  const spec = SLASH_COMMANDS.find((candidate) => expandAliases(candidate).includes(normalized));
  if (!spec) {
    return null;
  }

  return {
    id: spec.id,
    input: raw.trim(),
    spec
  };
}

export function validateSlashCommandContext(
  spec: SlashCommandSpec,
  context: {
    sessionReady: boolean;
    runtimeGoalReady: boolean;
  }
): string | null {
  if (spec.requiresSession && !context.sessionReady) {
    return "Session is required. Run /start first.";
  }

  if (spec.requiresRuntimeGoal && !context.runtimeGoalReady) {
    return "Runtime goal is required. Run /runtime start first.";
  }

  return null;
}

export function buildSlashHelpText(): string {
  return SLASH_COMMANDS.map((spec) => `${spec.canonical} - ${spec.help}`).join("\n");
}
