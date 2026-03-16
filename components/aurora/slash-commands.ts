import type { SlashCommandId, SlashCommandSpec } from "./types";

type SlashPaletteContext = {
  sessionReady: boolean;
};

export const SLASH_COMMANDS: SlashCommandSpec[] = [
  {
    id: "start_session",
    category: "session",
    canonical: "/start",
    aliasesKo: ["/시작"],
    help: "Start a new session from the current brief.",
    paletteVisibility: "pre_session"
  },
  {
    id: "setup_brief",
    category: "session",
    canonical: "/setup",
    aliasesKo: ["/설정"],
    help: "Set setup fields before start. Example: /setup q0 4",
    paletteVisibility: "pre_session"
  },
  {
    id: "run_step",
    category: "pipeline",
    canonical: "/run",
    aliasesKo: ["/진행"],
    help: "Run the next stage.",
    paletteVisibility: "active_session"
  },
  {
    id: "confirm_build",
    category: "pipeline",
    canonical: "/build",
    aliasesKo: ["/빌드", "/승인"],
    help: "Confirm build when approve step is waiting.",
    paletteVisibility: "active_session",
    requiresSession: true
  },
  {
    id: "pick_1",
    category: "pipeline",
    canonical: "/pick 1",
    aliasesKo: ["/선택 1"],
    help: "Select candidate #1.",
    paletteVisibility: "active_session",
    requiresSession: true,
    queueable: true
  },
  {
    id: "pick_2",
    category: "pipeline",
    canonical: "/pick 2",
    aliasesKo: ["/선택 2"],
    help: "Select candidate #2.",
    paletteVisibility: "active_session",
    requiresSession: true,
    queueable: true
  },
  {
    id: "pick_3",
    category: "pipeline",
    canonical: "/pick 3",
    aliasesKo: ["/선택 3"],
    help: "Select candidate #3.",
    paletteVisibility: "active_session",
    requiresSession: true,
    queueable: true
  },
  {
    id: "regenerate_top3",
    category: "pipeline",
    canonical: "/regen top3",
    aliasesKo: ["/재생성 top3", "/재생성 top-3"],
    help: "Regenerate Top-3 candidates.",
    paletteVisibility: "hidden",
    requiresSession: true,
    queueable: true
  },
  {
    id: "regenerate_outputs",
    category: "pipeline",
    canonical: "/regen outputs",
    aliasesKo: ["/재생성 outputs", "/재생성 산출물"],
    help: "Regenerate package outputs from selected candidate.",
    paletteVisibility: "hidden",
    requiresSession: true
  },
  {
    id: "export_zip",
    category: "pipeline",
    canonical: "/export",
    aliasesKo: ["/내보내기"],
    help: "Export pack zip.",
    paletteVisibility: "active_session",
    requiresSession: true
  },
  {
    id: "tone_editorial",
    category: "tone",
    canonical: "/tone editorial",
    aliasesKo: ["/톤 에디토리얼"],
    help: "Make style more editorial.",
    paletteVisibility: "hidden",
    requiresSession: true,
    queueable: true
  },
  {
    id: "tone_less_futuristic",
    category: "tone",
    canonical: "/tone less-futuristic",
    aliasesKo: ["/톤 미래감축소"],
    help: "Reduce futuristic accents.",
    paletteVisibility: "hidden",
    requiresSession: true,
    queueable: true
  },
  {
    id: "tone_calmer",
    category: "tone",
    canonical: "/tone calmer",
    aliasesKo: ["/톤 차분하게"],
    help: "Make the direction calmer.",
    paletteVisibility: "hidden",
    requiresSession: true,
    queueable: true
  },
  {
    id: "tone_ritual",
    category: "tone",
    canonical: "/tone ritual",
    aliasesKo: ["/톤 리추얼"],
    help: "Increase ritual mood.",
    paletteVisibility: "hidden",
    requiresSession: true,
    queueable: true
  },
  {
    id: "help",
    category: "utility",
    canonical: "/help",
    aliasesKo: ["/도움말"],
    help: "Show slash command help.",
    paletteVisibility: "always"
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

function isSurfacedCommand(spec: SlashCommandSpec, context: SlashPaletteContext): boolean {
  const visibility = spec.paletteVisibility ?? "always";
  if (visibility === "hidden") {
    return false;
  }
  if (visibility === "pre_session") {
    return !context.sessionReady;
  }
  if (visibility === "active_session") {
    return context.sessionReady;
  }
  return true;
}

function listSurfacedSlashCommands(context: SlashPaletteContext): SlashCommandSpec[] {
  return SLASH_COMMANDS.filter((spec) => isSurfacedCommand(spec, context));
}

export function filterSlashCommands(query: string, context: SlashPaletteContext = { sessionReady: false }): SlashCommandSpec[] {
  const normalized = toLower(query);
  if (!normalized.startsWith("/")) {
    return [];
  }

  if (normalized === "/") {
    return listSurfacedSlashCommands(context);
  }

  return listSurfacedSlashCommands(context).filter((spec) => {
    return expandAliases(spec).some((alias) => alias.includes(normalized) || normalized.startsWith(`${alias} `));
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

export function buildSlashHelpText(context: SlashPaletteContext = { sessionReady: false }): string {
  const commands = listSurfacedSlashCommands(context);
  return [
    ...commands.map((spec) => `${spec.canonical} - ${spec.help}`),
    "",
    "Use natural language in chat for tone shifts or refinement requests."
  ].join("\n");
}
