import { z } from "zod";
import { env } from "../env";
import { assessBriefHardBlock } from "../agent/brief-guard";
import {
  generateDeterministicCandidates,
  selectTopCandidates,
  toMockCandidateImageUrl,
  toVariationWidth
} from "../agent/candidate";
import type { Candidate, SupportingAsset, VariationWidth } from "../agent/types";
import type { BrandDirection } from "../brand-spec.schema";

function createDefaultDirectionAssetIntent() {
  return {
    focus: "balanced",
    rationale: "Balance a cinematic hero subject with environmental context and one signature prop.",
    priority_order: ["portrait", "background", "prop"],
    default_bundle: "balanced hero + background + prop",
    defaults_applied: true,
    question: "For the first concept set, should Aurora emphasize portrait, background, or signature prop?"
  };
}

const DIRECTION_ASSET_INTENT_DEFAULT = createDefaultDirectionAssetIntent();

const GENERIC_CONSTRAINT_PATTERNS = [/^open direction/i, /^none provided$/i, /^explore broadly$/i] as const;

function buildDirectionClarityHeuristic(input: {
  product: string;
  audience: string;
  styleKeywords: string[];
  constraint?: string | null;
}): BrandDirection["clarity"] {
  const product = input.product.trim();
  const audience = input.audience.trim();
  const styleKeywords = uniqueStrings(input.styleKeywords.map((keyword) => keyword.trim()).filter(Boolean));
  const constraint = input.constraint?.trim() ?? "";
  const hardBlock = assessBriefHardBlock({
    product,
    audience
  });
  const constraintIsGeneric =
    constraint.length === 0 || GENERIC_CONSTRAINT_PATTERNS.some((pattern) => pattern.test(constraint.toLowerCase()));
  const softPenalty = (styleKeywords.length <= 1 ? 1 : 0) + (constraintIsGeneric ? 1 : 0);

  const readyForConcepts = !hardBlock.should_block;
  const score = readyForConcepts
    ? Math.max(3, Math.min(5, 5 - softPenalty))
    : Math.max(1, Math.min(3, 3 - hardBlock.missing_inputs.length + 1));

  return {
    score,
    ready_for_concepts: readyForConcepts,
    summary: readyForConcepts
      ? softPenalty > 0
        ? "The brief is concrete enough to explore. Aurora can refine tone and constraints further in chat."
        : "The brief is concrete enough to generate concept bundles."
      : hardBlock.summary,
    missing_inputs: readyForConcepts ? [] : hardBlock.missing_inputs,
    followup_questions: readyForConcepts ? [] : hardBlock.followup_questions.slice(0, 3)
  };
}

const directionAssetIntentSchema = z.object({
  focus: z.string(),
  rationale: z.string(),
  priority_order: z.array(z.string()).min(3),
  default_bundle: z.string(),
  defaults_applied: z.boolean(),
  question: z.string()
});

const directionClaritySchema = z.object({
  score: z.number().int().min(1).max(5),
  ready_for_concepts: z.boolean(),
  summary: z.string(),
  missing_inputs: z.array(z.string()).default([]),
  followup_questions: z.array(z.string()).default([])
});

const directionResponseSchema = z.object({
  brief_summary: z.string(),
  brand_promise: z.string(),
  audience_tension: z.string(),
  narrative_summary: z.string(),
  voice_principles: z.array(z.string()).min(2),
  anti_goals: z.array(z.string()).min(2),
  visual_principles: z.array(z.string()).min(3),
  image_intent: z.string(),
  prompt_seed: z.string(),
  next_question: z.string(),
  asset_intent: directionAssetIntentSchema.default(createDefaultDirectionAssetIntent()),
  clarity: directionClaritySchema.default(
    buildDirectionClarityHeuristic({
      product: "Untitled concept",
      audience: "General audience",
      styleKeywords: [],
      constraint: null
    })
  )
});

const candidateSupportingAssetSchema = z.object({
  kind: z.string(),
  title: z.string(),
  prompt: z.string()
});

const candidateStorySchema = z.object({
  premise: z.string(),
  narrative: z.string(),
  asset_rationale: z.string()
});

const candidateResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        naming: z.object({
          recommended: z.string(),
          candidates: z.array(z.string()).min(1)
        }),
        moodboard: z.object({
          title: z.string(),
          prompt: z.string(),
          colors: z.array(z.string()).min(3)
        }),
        ui_plan: z.object({
          headline: z.string(),
          layout: z.array(z.string()).min(2),
          cta: z.string()
        }),
        rationale: z.string(),
        narrative_summary: z.string(),
        image_prompt: z.string(),
        supporting_assets: z.array(candidateSupportingAssetSchema).length(3).default([
          {
            kind: "portrait",
            title: "Character study",
            prompt: "Create a character-led support asset."
          },
          {
            kind: "background",
            title: "Atmosphere background",
            prompt: "Create an environment-led support asset."
          },
          {
            kind: "prop",
            title: "Signature prop",
            prompt: "Create a symbolic prop-led support asset."
          }
        ]),
        story: candidateStorySchema.default({
          premise: "",
          narrative: "",
          asset_rationale: ""
        })
      })
    )
    .min(3)
});

const SOCIAL_IMAGE_SPECS = [
  {
    key: "post_1200x675",
    size: "1536x1024",
    intent: "landscape social cover"
  },
  {
    key: "post_1080x1080",
    size: "1024x1024",
    intent: "square social post"
  },
  {
    key: "post_1080x1920",
    size: "1024x1536",
    intent: "vertical story post"
  }
] as const;

type SocialImageKey = (typeof SOCIAL_IMAGE_SPECS)[number]["key"];
export type OpenAiTextUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

function normalizeLines(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toLoggableError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function truncateForLog(value: string, limit = 4000): string {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function logOpenAiFailure(event: string, details: Record<string, unknown>) {
  console.error(event, details);
}

function clampScore(score: number): number {
  return Number(Math.max(0.45, Math.min(0.98, score)).toFixed(3));
}

function toDirectionAssetIntent(input: {
  focus?: string | null;
  defaultsApplied?: boolean;
} = {}): BrandDirection["asset_intent"] {
  const normalizedFocus = input.focus?.trim().toLowerCase();
  if (normalizedFocus?.includes("background")) {
    return {
      ...DIRECTION_ASSET_INTENT_DEFAULT,
      focus: "background",
      rationale: "Lead with environment and atmosphere, then support it with a human focal point and one symbolic prop.",
      priority_order: ["background", "portrait", "prop"],
      defaults_applied: input.defaultsApplied ?? false
    };
  }
  if (normalizedFocus?.includes("prop")) {
    return {
      ...DIRECTION_ASSET_INTENT_DEFAULT,
      focus: "prop",
      rationale: "Lead with a signature object or symbolic detail, then support it with portrait energy and environmental context.",
      priority_order: ["prop", "portrait", "background"],
      defaults_applied: input.defaultsApplied ?? false
    };
  }
  if (normalizedFocus?.includes("portrait") || normalizedFocus?.includes("human") || normalizedFocus?.includes("character")) {
    return {
      ...DIRECTION_ASSET_INTENT_DEFAULT,
      focus: "portrait",
      rationale: "Lead with a human-centered hero, then support it with a branded environment and one memorable prop detail.",
      priority_order: ["portrait", "background", "prop"],
      defaults_applied: input.defaultsApplied ?? false
    };
  }
  return {
    ...DIRECTION_ASSET_INTENT_DEFAULT,
    priority_order: [...DIRECTION_ASSET_INTENT_DEFAULT.priority_order],
    defaults_applied: input.defaultsApplied ?? true
  };
}

function toFallbackDirection(input: {
  product: string;
  audience: string;
  styleKeywords: string[];
  constraint?: string | null;
}): BrandDirection {
  const keywords = input.styleKeywords.length > 0 ? input.styleKeywords : ["clear", "cinematic", "premium"];
  const [toneA = "clear", toneB = "cinematic", toneC = "premium"] = keywords;
  const constraint = input.constraint?.trim() || "Keep the direction decisive, premium, and build-ready.";
  const clarity = buildDirectionClarityHeuristic({
    product: input.product,
    audience: input.audience,
    styleKeywords: input.styleKeywords,
    constraint: input.constraint
  });

  return {
    brief_summary: `${input.product} is being shaped for ${input.audience} with ${keywords.join(", ")} cues.`,
    brand_promise: `${input.product} turns an early product idea into a confident visual system for ${input.audience}.`,
    audience_tension: `${input.audience} want a premium point of view quickly, but scattered references make direction hard to trust.`,
    narrative_summary: `${input.product} should feel like a creative director that translates rough intent into a focused, shippable brand world.`,
    voice_principles: [
      `Keep the language ${toneA} and concrete.`,
      `Make the experience feel ${toneB} without becoming vague.`,
      `Hold a ${toneC} tone that still feels practical.`
    ],
    anti_goals: [
      "Avoid generic SaaS copy that sounds interchangeable.",
      "Avoid glossy trend-chasing visuals without product fit.",
      "Avoid sprawling direction that weakens the decision."
    ],
    visual_principles: [
      `Use ${toneA} hierarchy with obvious next steps.`,
      `Push a ${toneB} atmosphere through contrast, glow, and framing.`,
      `Keep the system ${toneC} with restrained accents and intentional typography.`,
      `Honor this non-negotiable note: ${constraint}`
    ],
    image_intent: `Show ${input.product} as a premium, image-led brand direction for ${input.audience}, preferably through a human-centered hero scene with one clear focal subject and a sense of momentum.`,
    prompt_seed: [
      `${input.product} brand concept`,
      `for ${input.audience}`,
      `mood: ${keywords.join(", ")}`,
      `constraint: ${constraint}`,
      "prefer a cinematic person-led hero scene"
    ].join(", "),
    next_question: clarity.ready_for_concepts
      ? DIRECTION_ASSET_INTENT_DEFAULT.question
      : clarity.followup_questions[0] ?? DIRECTION_ASSET_INTENT_DEFAULT.question,
    asset_intent: toDirectionAssetIntent({
      defaultsApplied: true
    }),
    clarity
  };
}

function buildDirectionPrompt(input: {
  product: string;
  audience: string;
  styleKeywords: string[];
  constraint?: string | null;
  currentDirection?: BrandDirection | null;
  revisionNote?: string | null;
}): string {
  const mode = input.currentDirection ? "refine" : "synthesize";
  return [
    "You create concise brand direction documents for AB Aurora.",
    `Mode: ${mode}.`,
    "Return JSON only.",
    "Fields required: brief_summary, brand_promise, audience_tension, narrative_summary, voice_principles, anti_goals, visual_principles, image_intent, prompt_seed, next_question, asset_intent, clarity.",
    "asset_intent must be an object with: focus, rationale, priority_order, default_bundle, defaults_applied, question.",
    "clarity must be an object with: score, ready_for_concepts, summary, missing_inputs, followup_questions.",
    "focus should answer whether the first concept set should lean toward portrait, background, prop, or stay balanced.",
    "Only keep ready_for_concepts false when the brief is genuinely too underspecified or placeholder-heavy to produce useful concepts.",
    "A compressed but concrete one-sentence brief can still be ready for concepts when the product and audience anchors are clear, even if tone guidance is sparse.",
    "If ready_for_concepts is false, next_question must be the highest-priority clarification question and clarity.followup_questions must contain 1 to 3 targeted questions.",
    "If ready_for_concepts is true, next_question should ask whether Aurora should emphasize portrait, background, or prop first.",
    "Write like a creative strategist with execution discipline.",
    `Product: ${input.product}`,
    `Audience: ${input.audience}`,
    `Style keywords: ${input.styleKeywords.join(", ") || "exploratory"}`,
    `Constraint: ${input.constraint?.trim() || "None provided"}`,
    input.currentDirection ? `Current direction: ${JSON.stringify(input.currentDirection)}` : null,
    input.revisionNote ? `Refinement request: ${input.revisionNote}` : null,
    "Keep the direction decisive and ready to generate images from.",
    "AB Aurora should ask follow-up questions in DEFINE until the project being built is clear enough to get high-quality concept bundles in one pass."
  ]
    .filter(Boolean)
    .join("\n");
}

function toMockSocialAssetUrl(input: { sessionId: string; key: SocialImageKey }): string {
  return `generated://${input.sessionId}/social/${input.key}.png`;
}

function toCandidatePrompt(input: {
  direction: BrandDirection;
  product: string;
  audience: string;
  styleKeywords: string[];
  variationWidth: VariationWidth;
  candidateCount: number;
}): string {
  return [
    "You generate brand direction candidates.",
    "Return JSON only with field \"candidates\".",
    `Return exactly ${input.candidateCount} candidates.`,
    "Each candidate must contain naming, moodboard, ui_plan, rationale, narrative_summary, image_prompt, supporting_assets, story.",
    "naming must be an object: { recommended: string, candidates: string[] }.",
    "moodboard must be an object: { title: string, prompt: string, colors: string[] }.",
    "ui_plan must be an object: { headline: string, layout: string[], cta: string }.",
    "supporting_assets must be an array of exactly 3 objects: { kind: string, title: string, prompt: string }.",
    "story must be an object: { premise: string, narrative: string, asset_rationale: string }.",
    "Do not return strings or arrays in place of those objects.",
    "Use hex colors in moodboard.colors when possible.",
    "Prefer cinematic hero concepts with a clear human or character presence when the brief does not forbid people.",
    "Avoid pure abstract moodboard imagery unless the direction explicitly asks for non-human or purely graphic treatment.",
    "Each candidate is an asset bundle: 1 hero image plus 3 supporting assets and one story block.",
    "The supporting assets should usually cover portrait/background/prop unless the asset intent asks for a different emphasis.",
    "Make each candidate materially distinct while staying inside the shared direction.",
    `Product: ${input.product}`,
    `Audience: ${input.audience}`,
    `Style keywords: ${input.styleKeywords.join(", ")}`,
    `Variation width: ${input.variationWidth}`,
    `Direction: ${JSON.stringify(input.direction)}`,
    'Example candidate shape: {"naming":{"recommended":"Aurora Arc","candidates":["Aurora Arc","Aurora Line"]},"moodboard":{"title":"Quiet cosmic ritual","prompt":"deep navy aura with restrained cyan glow","colors":["#0B1020","#365BFF","#F4B860"]},"ui_plan":{"headline":"Shape the brand with calm confidence","layout":["hero","proof-strip","feature-grid","cta-footer"],"cta":"Generate Concepts"},"rationale":"...","narrative_summary":"...","image_prompt":"...","supporting_assets":[{"kind":"portrait","title":"Character study","prompt":"..."},{"kind":"background","title":"Atmosphere background","prompt":"..."},{"kind":"prop","title":"Signature prop","prompt":"..."}],"story":{"premise":"...","narrative":"...","asset_rationale":"..."}}'
  ].join("\n");
}

function toScalarString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => toScalarString(entry))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  const scalar = toScalarString(value);
  if (!scalar) {
    return [];
  }

  return scalar
    .split(/[,|\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isColorToken(value: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function resolveAssetKindOrder(direction: BrandDirection | null | undefined): Array<{ kind: string; title: string }> {
  const focus = direction?.asset_intent?.focus?.toLowerCase() ?? "balanced";
  if (focus.includes("background")) {
    return [
      { kind: "background", title: "Atmosphere background" },
      { kind: "portrait", title: "Character study" },
      { kind: "prop", title: "Signature prop" }
    ];
  }
  if (focus.includes("prop")) {
    return [
      { kind: "prop", title: "Signature prop" },
      { kind: "portrait", title: "Character study" },
      { kind: "background", title: "Atmosphere background" }
    ];
  }
  return [
    { kind: "portrait", title: "Character study" },
    { kind: "background", title: "Atmosphere background" },
    { kind: "prop", title: "Signature prop" }
  ];
}

function buildDefaultSupportingAssets(input: {
  product: string;
  audience: string;
  styleKeywords: string[];
  direction: BrandDirection | null | undefined;
  candidateName: string;
  narrativeSummary: string;
  heroPrompt: string;
}): Array<{ kind: string; title: string; prompt: string }> {
  const keywordSeed = input.styleKeywords.join(", ") || "cinematic, premium";
  return resolveAssetKindOrder(input.direction).map((asset) => ({
    kind: asset.kind,
    title: asset.title,
    prompt: [
      `Create a ${asset.kind} support image for ${input.candidateName}.`,
      `Product: ${input.product}.`,
      `Audience: ${input.audience}.`,
      `Narrative cue: ${input.narrativeSummary}.`,
      `Mood keywords: ${keywordSeed}.`,
      `Hero prompt seed: ${input.heroPrompt}.`
    ].join(" ")
  }));
}

function normalizeDirectionClarity(input: {
  raw: unknown;
  product: string;
  audience: string;
  styleKeywords: string[];
  constraint?: string | null;
  nextQuestion: string;
}): BrandDirection["clarity"] {
  const fallback = buildDirectionClarityHeuristic({
    product: input.product,
    audience: input.audience,
    styleKeywords: input.styleKeywords,
    constraint: input.constraint
  });
  const rawRecord =
    input.raw && typeof input.raw === "object" && !Array.isArray(input.raw)
      ? (input.raw as Record<string, unknown>)
      : null;
  const rawScore = Number(rawRecord?.score);
  const modelReady =
    typeof rawRecord?.ready_for_concepts === "boolean" ? rawRecord.ready_for_concepts : fallback.ready_for_concepts;
  const missingInputs = uniqueStrings([
    ...fallback.missing_inputs,
    ...toStringList(rawRecord?.missing_inputs ?? rawRecord?.missing)
  ]);
  const followupQuestions = uniqueStrings([
    ...toStringList(rawRecord?.followup_questions ?? rawRecord?.questions),
    ...(fallback.ready_for_concepts ? [] : fallback.followup_questions),
    ...((!modelReady || !fallback.ready_for_concepts) && input.nextQuestion.trim().length > 0 ? [input.nextQuestion] : [])
  ]).slice(0, 3);
  const readyForConcepts = Boolean(modelReady) && fallback.ready_for_concepts;
  const score = readyForConcepts
    ? Math.max(4, Number.isFinite(rawScore) ? Math.round(rawScore) : fallback.score)
    : Math.min(
        Number.isFinite(rawScore) ? Math.max(1, Math.round(rawScore)) : fallback.score,
        Math.max(1, 5 - missingInputs.length)
      );

  return {
    score: Math.max(1, Math.min(5, score)),
    ready_for_concepts: readyForConcepts,
    summary:
      toScalarString(rawRecord?.summary) ||
      (readyForConcepts ? "Direction is specific enough to generate concept bundles." : fallback.summary),
    missing_inputs: readyForConcepts ? [] : missingInputs,
    followup_questions: readyForConcepts ? [] : followupQuestions
  };
}

function normalizeDirectionResponsePayload(input: {
  raw: unknown;
  product: string;
  audience: string;
  styleKeywords: string[];
  constraint?: string | null;
}): BrandDirection {
  const fallback = toFallbackDirection(input);
  const rawRecord = input.raw && typeof input.raw === "object" && !Array.isArray(input.raw)
    ? (input.raw as Record<string, unknown>)
    : {};
  const rawAssetIntent = rawRecord.asset_intent;
  const assetIntentRecord =
    rawAssetIntent && typeof rawAssetIntent === "object" && !Array.isArray(rawAssetIntent)
      ? (rawAssetIntent as Record<string, unknown>)
      : null;
  const normalizedFocus =
    toScalarString(assetIntentRecord?.focus, toScalarString(rawAssetIntent, fallback.asset_intent.focus)) ||
    fallback.asset_intent.focus;
  const assetIntent = {
    ...toDirectionAssetIntent({
      focus: normalizedFocus,
      defaultsApplied:
        typeof assetIntentRecord?.defaults_applied === "boolean"
          ? assetIntentRecord.defaults_applied
          : fallback.asset_intent.defaults_applied
    }),
    rationale:
      toScalarString(assetIntentRecord?.rationale, fallback.asset_intent.rationale) ||
      fallback.asset_intent.rationale,
    priority_order:
      uniqueStrings(toStringList(assetIntentRecord?.priority_order)).length >= 3
        ? uniqueStrings(toStringList(assetIntentRecord?.priority_order)).slice(0, 3)
        : [...fallback.asset_intent.priority_order],
    default_bundle:
      toScalarString(assetIntentRecord?.default_bundle, fallback.asset_intent.default_bundle) ||
      fallback.asset_intent.default_bundle,
    question: toScalarString(assetIntentRecord?.question, fallback.asset_intent.question) || fallback.asset_intent.question
  };
  const nextQuestion = toScalarString(rawRecord.next_question, assetIntent.question) || assetIntent.question;
  const clarity = normalizeDirectionClarity({
    raw: rawRecord.clarity,
    product: input.product,
    audience: input.audience,
    styleKeywords: input.styleKeywords,
    constraint: input.constraint,
    nextQuestion
  });

  return {
    brief_summary: toScalarString(rawRecord.brief_summary, fallback.brief_summary) || fallback.brief_summary,
    brand_promise: toScalarString(rawRecord.brand_promise, fallback.brand_promise) || fallback.brand_promise,
    audience_tension: toScalarString(rawRecord.audience_tension, fallback.audience_tension) || fallback.audience_tension,
    narrative_summary:
      toScalarString(rawRecord.narrative_summary, fallback.narrative_summary) || fallback.narrative_summary,
    voice_principles:
      uniqueStrings(toStringList(rawRecord.voice_principles)).length >= 2
        ? uniqueStrings(toStringList(rawRecord.voice_principles)).slice(0, 4)
        : fallback.voice_principles,
    anti_goals:
      uniqueStrings(toStringList(rawRecord.anti_goals)).length >= 2
        ? uniqueStrings(toStringList(rawRecord.anti_goals)).slice(0, 4)
        : fallback.anti_goals,
    visual_principles:
      uniqueStrings(toStringList(rawRecord.visual_principles)).length >= 3
        ? uniqueStrings(toStringList(rawRecord.visual_principles)).slice(0, 5)
        : fallback.visual_principles,
    image_intent: toScalarString(rawRecord.image_intent, fallback.image_intent) || fallback.image_intent,
    prompt_seed: toScalarString(rawRecord.prompt_seed, fallback.prompt_seed) || fallback.prompt_seed,
    next_question: clarity.ready_for_concepts ? nextQuestion : clarity.followup_questions[0] ?? nextQuestion,
    asset_intent: assetIntent,
    clarity
  };
}

function normalizeCandidateResponsePayload(input: {
  raw: unknown;
  product: string;
  audience: string;
  styleKeywords: string[];
  direction: BrandDirection;
}): z.infer<typeof candidateResponseSchema> {
  const fallbackColors = ["#0B1020", "#365BFF", "#F4B860"];
  const fallbackLayout = ["hero", "proof-strip", "feature-grid", "cta-footer"];
  const fallbackKeyword = input.styleKeywords[0] ?? "focused";
  const rawCandidates =
    Array.isArray(input.raw)
      ? input.raw
      : input.raw && typeof input.raw === "object" && Array.isArray((input.raw as { candidates?: unknown }).candidates)
        ? ((input.raw as { candidates: unknown[] }).candidates ?? [])
        : [];

  return {
    candidates: rawCandidates.map((rawCandidate, index) => {
      const fallbackName = `${input.product} Concept ${index + 1}`;
      const fallbackHeadline = `${input.product} for ${input.audience}`;
      const fallbackNarrative = `${input.product} frames ${input.audience} through a ${fallbackKeyword} direction with clear momentum.`;
      const fallbackPrompt = `${input.product} brand concept for ${input.audience}, ${input.styleKeywords.join(", ") || "focused"}, premium human-centered hero image, cinematic subject, expressive portrait scene.`;
      const candidateRecord =
        rawCandidate && typeof rawCandidate === "object" ? (rawCandidate as Record<string, unknown>) : {};

      const namingValue = candidateRecord.naming;
      const namingRecord =
        namingValue && typeof namingValue === "object" && !Array.isArray(namingValue)
          ? (namingValue as Record<string, unknown>)
          : null;
      const namingCandidates = uniqueStrings([
        ...toStringList(namingRecord?.candidates),
        ...toStringList(namingValue)
      ]);
      const recommendedName =
        toScalarString(namingRecord?.recommended, namingCandidates[0] ?? fallbackName) || fallbackName;

      const moodboardValue = candidateRecord.moodboard;
      const moodboardRecord =
        moodboardValue && typeof moodboardValue === "object" && !Array.isArray(moodboardValue)
          ? (moodboardValue as Record<string, unknown>)
          : null;
      const moodboardStrings = [
        ...toStringList(moodboardValue),
        ...toStringList(moodboardRecord?.title),
        ...toStringList(moodboardRecord?.prompt)
      ];
      const moodboardColors = uniqueStrings([
        ...toStringList(moodboardRecord?.colors).filter(isColorToken),
        ...moodboardStrings.filter(isColorToken)
      ]);
      const moodboardTitle =
        toScalarString(moodboardRecord?.title, moodboardStrings.find((value) => !isColorToken(value)) ?? `${fallbackKeyword} direction`);
      const moodboardPrompt =
        toScalarString(
          moodboardRecord?.prompt,
          moodboardStrings.filter((value) => !isColorToken(value)).slice(1).join(", ") || fallbackPrompt
        ) || fallbackPrompt;

      const uiPlanValue = candidateRecord.ui_plan;
      const uiPlanRecord =
        uiPlanValue && typeof uiPlanValue === "object" && !Array.isArray(uiPlanValue)
          ? (uiPlanValue as Record<string, unknown>)
          : null;
      const uiPlanStrings = [...toStringList(uiPlanValue), ...toStringList(uiPlanRecord?.headline)];
      const uiPlanLayout = uniqueStrings([
        ...toStringList(uiPlanRecord?.layout),
        ...uiPlanStrings.filter((value) => value.includes("-") || value.includes("hero") || value.includes("cta"))
      ]);
      const uiPlanHeadline =
        toScalarString(uiPlanRecord?.headline, uiPlanStrings[0] ?? fallbackHeadline) || fallbackHeadline;
      const uiPlanCta =
        toScalarString(uiPlanRecord?.cta, toStringList(uiPlanValue).at(-1) ?? "Explore this direction") || "Explore this direction";

      const defaultSupportingAssets = buildDefaultSupportingAssets({
        product: input.product,
        audience: input.audience,
        styleKeywords: input.styleKeywords,
        direction: input.direction,
        candidateName: recommendedName,
        narrativeSummary: toScalarString(candidateRecord.narrative_summary, fallbackNarrative) || fallbackNarrative,
        heroPrompt: toScalarString(candidateRecord.image_prompt, fallbackPrompt) || fallbackPrompt
      });
      const rawSupportingAssets = Array.isArray(candidateRecord.supporting_assets)
        ? candidateRecord.supporting_assets
        : [];
      const supportingAssets = defaultSupportingAssets.map((fallbackAsset, assetIndex) => {
        const rawAsset = rawSupportingAssets[assetIndex];
        const assetRecord =
          rawAsset && typeof rawAsset === "object" && !Array.isArray(rawAsset)
            ? (rawAsset as Record<string, unknown>)
            : null;
        return {
          kind: toScalarString(assetRecord?.kind, fallbackAsset.kind) || fallbackAsset.kind,
          title: toScalarString(assetRecord?.title, fallbackAsset.title) || fallbackAsset.title,
          prompt: toScalarString(assetRecord?.prompt, fallbackAsset.prompt) || fallbackAsset.prompt
        };
      });

      const storyValue = candidateRecord.story;
      const storyRecord =
        storyValue && typeof storyValue === "object" && !Array.isArray(storyValue)
          ? (storyValue as Record<string, unknown>)
          : null;
      const story = {
        premise:
          toScalarString(storyRecord?.premise, `${recommendedName} gives ${input.product} a story-led point of view.`) ||
          `${recommendedName} gives ${input.product} a story-led point of view.`,
        narrative:
          toScalarString(
            storyRecord?.narrative,
            `${recommendedName} pairs a hero scene with supporting background and prop details so ${input.audience} can feel a complete brand world instead of a single static moodboard.`
          ) ||
          `${recommendedName} pairs a hero scene with supporting background and prop details so ${input.audience} can feel a complete brand world instead of a single static moodboard.`,
        asset_rationale:
          toScalarString(
            storyRecord?.asset_rationale,
            "The asset bundle combines one decisive hero with supporting images that explain environment, object language, and brand tone."
          ) ||
          "The asset bundle combines one decisive hero with supporting images that explain environment, object language, and brand tone."
      };

      return {
        naming: {
          recommended: recommendedName,
          candidates: namingCandidates.length > 0 ? namingCandidates : [recommendedName]
        },
        moodboard: {
          title: moodboardTitle,
          prompt: moodboardPrompt,
          colors: moodboardColors.length >= 3 ? moodboardColors.slice(0, 5) : fallbackColors
        },
        ui_plan: {
          headline: uiPlanHeadline,
          layout: uiPlanLayout.length >= 2 ? uiPlanLayout.slice(0, 6) : fallbackLayout,
          cta: uiPlanCta
        },
        rationale:
          toScalarString(candidateRecord.rationale, `${recommendedName} creates a clearer route for ${input.audience}.`) ||
          `${recommendedName} creates a clearer route for ${input.audience}.`,
        narrative_summary:
          toScalarString(candidateRecord.narrative_summary, fallbackNarrative) || fallbackNarrative,
        image_prompt: toScalarString(candidateRecord.image_prompt, fallbackPrompt) || fallbackPrompt,
        supporting_assets: supportingAssets,
        story
      };
    })
  };
}

function toCandidate(
  index: number,
  item: z.infer<typeof candidateResponseSchema>["candidates"][number],
  imageUrl: string,
  supportingAssets: SupportingAsset[]
): Candidate {
  return {
    id: `cand_${index + 1}`,
    rank: index + 1,
    score: clampScore(0.96 - index * 0.05),
    naming: {
      recommended: item.naming.recommended,
      candidates: item.naming.candidates
    },
    moodboard: {
      title: item.moodboard.title,
      prompt: item.moodboard.prompt,
      colors: item.moodboard.colors
    },
    ui_plan: {
      headline: item.ui_plan.headline,
      layout: item.ui_plan.layout,
      cta: item.ui_plan.cta
    },
    rationale: item.rationale,
    narrative_summary: item.narrative_summary,
    image_prompt: item.image_prompt,
    image_url: imageUrl,
    supporting_assets: supportingAssets,
    story: item.story,
    revision_basis: null
  };
}

function ensureCandidateBundle(input: {
  candidate: z.infer<typeof candidateResponseSchema>["candidates"][number];
  product: string;
  audience: string;
  styleKeywords: string[];
  direction: BrandDirection;
}): z.infer<typeof candidateResponseSchema>["candidates"][number] {
  const supportingAssets =
    input.candidate.supporting_assets ??
    buildDefaultSupportingAssets({
      product: input.product,
      audience: input.audience,
      styleKeywords: input.styleKeywords,
      direction: input.direction,
      candidateName: input.candidate.naming.recommended,
      narrativeSummary: input.candidate.narrative_summary,
      heroPrompt: input.candidate.image_prompt
    });

  const story =
    input.candidate.story ?? {
      premise: `${input.candidate.naming.recommended} gives ${input.product} a story-led direction.`,
      narrative: input.candidate.narrative_summary,
      asset_rationale: "The bundle combines one hero with supporting environment and prop imagery."
    };

  return {
    ...input.candidate,
    supporting_assets: supportingAssets,
    story
  };
}

function toSocialAssetPrompt(input: {
  candidate: Candidate;
  intent: string;
}): string {
  return [
    "Create a premium brand visual for social media.",
    "No readable text, no watermark, no logo marks.",
    "Keep calm ritual mood with restrained cyan glow and deep navy-charcoal base.",
    `Visual intent: ${input.intent}.`,
    `Name cue: ${input.candidate.naming.recommended}.`,
    `Moodboard title: ${input.candidate.moodboard.title}.`,
    `Moodboard prompt: ${input.candidate.moodboard.prompt}.`,
    `Palette hint: ${input.candidate.moodboard.colors.join(", ")}.`
  ].join("\n");
}

function toMockSupportingAssetImageUrl(input: {
  candidateName: string;
  assetTitle: string;
  prompt: string;
  colors: string[];
}): string {
  return toMockCandidateImageUrl({
    candidateName: `${input.candidateName} / ${input.assetTitle}`,
    headline: input.assetTitle,
    narrative: input.prompt,
    colors: input.colors
  });
}

function toMockRevisionImageUrl(input: {
  title: string;
  prompt: string;
  colors?: string[];
}): string {
  const [base = "#091020", glow = "#365BFF", accent = "#F4B860"] = input.colors ?? [];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${base}" />
          <stop offset="55%" stop-color="${glow}" stop-opacity="0.72" />
          <stop offset="100%" stop-color="#070A16" />
        </linearGradient>
      </defs>
      <rect width="1536" height="1024" fill="url(#bg)" />
      <circle cx="768" cy="410" r="230" fill="${accent}" fill-opacity="0.2" />
      <circle cx="768" cy="410" r="178" fill="none" stroke="rgba(255,255,255,0.28)" />
      <text x="96" y="116" fill="rgba(255,255,255,0.92)" font-family="Georgia, serif" font-size="58">${input.title}</text>
      <foreignObject x="96" y="760" width="1240" height="180">
        <div xmlns="http://www.w3.org/1999/xhtml" style="color: rgba(235,240,255,0.82); font-family: Arial, sans-serif; font-size: 30px; line-height: 1.5;">
          ${input.prompt}
        </div>
      </foreignObject>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function fetchJsonChatCompletion<S extends z.ZodTypeAny>(input: {
  system: string;
  user: string;
  temperature?: number;
  schema: S;
  coerce?: (value: unknown) => unknown;
}): Promise<{ data: z.output<S>; usage: OpenAiTextUsage | null }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL_TEXT,
      temperature: input.temperature ?? 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user }
      ]
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI call failed (${response.status}): ${errorBody}`);
  }

  const completion = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty OpenAI response");
  }

  const usage =
    typeof completion.usage?.prompt_tokens === "number" &&
    typeof completion.usage?.completion_tokens === "number" &&
    typeof completion.usage?.total_tokens === "number"
      ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens
        }
      : null;

  return {
    data: input.schema.parse(input.coerce ? input.coerce(JSON.parse(content)) : JSON.parse(content)),
    usage
  };
}

async function generateOpenAiImageUrl(input: {
  prompt: string;
  size: (typeof SOCIAL_IMAGE_SPECS)[number]["size"];
  responseFormat?: "url" | "b64_json";
  logContext?: Record<string, unknown>;
}): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL_IMAGE,
      prompt: input.prompt,
      size: input.size,
      n: 1,
      response_format: input.responseFormat ?? "url"
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logOpenAiFailure("[openai.image.failed]", {
      model: env.OPENAI_MODEL_IMAGE,
      size: input.size,
      status: response.status,
      error: truncateForLog(errorBody),
      ...input.logContext
    });
    throw new Error(`OpenAI image call failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{
      url?: string;
      b64_json?: string;
    }>;
  };
  const first = payload.data?.[0];
  if (first?.url && typeof first.url === "string") {
    return first.url;
  }
  if (first?.b64_json && typeof first.b64_json === "string") {
    return `data:image/png;base64,${first.b64_json}`;
  }
  throw new Error("OpenAI image call returned empty image payload.");
}

export async function generateDirectionWithFallback(input: {
  product: string;
  audience: string;
  styleKeywords: string[];
  constraint?: string | null;
  currentDirection?: BrandDirection | null;
  revisionNote?: string | null;
}): Promise<{ direction: BrandDirection; source: "openai" | "mock"; usage: OpenAiTextUsage | null }> {
  const fallbackDirection = toFallbackDirection(input);
  if (!env.OPENAI_API_KEY) {
    return { direction: fallbackDirection, source: "mock", usage: null };
  }

  try {
    const result = await fetchJsonChatCompletion({
      system: "You are a senior brand strategist who writes structured creative direction as JSON.",
      user: buildDirectionPrompt(input),
      temperature: input.currentDirection ? 0.45 : 0.65,
      schema: directionResponseSchema,
      coerce: (rawValue) => {
        const directParse = directionResponseSchema.safeParse(rawValue);
        if (directParse.success) {
          return directParse.data;
        }

        return normalizeDirectionResponsePayload({
          raw: rawValue,
          product: input.product,
          audience: input.audience,
          styleKeywords: input.styleKeywords,
          constraint: input.constraint
        });
      }
    });
    return { direction: directionResponseSchema.parse(result.data), source: "openai", usage: result.usage };
  } catch (error) {
    if (env.OPENAI_FALLBACK_MODE !== "deterministic_mock") {
      throw error;
    }
    return { direction: fallbackDirection, source: "mock", usage: null };
  }
}

export async function generateCandidatesWithFallback(input: {
  sessionId: string;
  product: string;
  audience: string;
  styleKeywords: string[];
  intentConfidence: number;
  direction: BrandDirection;
  candidateCount?: number;
  topK?: number;
}): Promise<{
  candidates: Candidate[];
  source: "openai" | "mock";
  usage: {
    text: OpenAiTextUsage | null;
    image_generations: number;
  };
  render_failures: Array<{
    candidate_id: string;
    candidate_name: string;
    error: string;
    fallback_used: boolean;
  }>;
}> {
  const candidateCount = input.candidateCount ?? env.TOP_K;
  const topK = input.topK ?? env.TOP_K;
  const variationWidth = toVariationWidth(input.intentConfidence);

  if (!env.OPENAI_API_KEY) {
    const fallback = generateDeterministicCandidates({
      sessionId: input.sessionId,
      product: input.product,
      audience: input.audience,
      styleKeywords: input.styleKeywords,
      variationWidth,
      candidateCount
    });
    return {
      candidates: selectTopCandidates(fallback, topK),
      source: "mock",
      usage: {
        text: null,
        image_generations: 0
      },
      render_failures: []
    };
  }

  try {
    const parsed = await fetchJsonChatCompletion({
      system: "You are a brand direction candidate generator.",
      user: toCandidatePrompt({
        direction: input.direction,
        product: input.product,
        audience: input.audience,
        styleKeywords: input.styleKeywords,
        variationWidth,
        candidateCount
      }),
      temperature: 0.82,
      schema: candidateResponseSchema,
      coerce: (rawValue) => {
        const directParse = candidateResponseSchema.safeParse(rawValue);
        if (directParse.success) {
          return directParse.data;
        }

        const repaired = normalizeCandidateResponsePayload({
          raw: rawValue,
          product: input.product,
          audience: input.audience,
          styleKeywords: input.styleKeywords,
          direction: input.direction
        });
        const repairedParse = candidateResponseSchema.safeParse(repaired);
        if (repairedParse.success) {
          logOpenAiFailure("[openai.candidates.schema_repaired]", {
            session_id: input.sessionId,
            issues: directParse.error.issues.slice(0, 6).map((issue) => ({
              path: issue.path.join("."),
              message: issue.message
            }))
          });
          return repairedParse.data;
        }

        throw directParse.error;
      }
    });

    const trimmed = parsed.data.candidates.slice(0, topK).map((candidate) =>
      ensureCandidateBundle({
        candidate,
        product: input.product,
        audience: input.audience,
        styleKeywords: input.styleKeywords,
        direction: input.direction
      })
    );
    const heroImageResults = await Promise.allSettled(
      trimmed.map((candidate, index) =>
        generateOpenAiImageUrl({
          prompt: candidate.image_prompt,
          size: "1024x1536",
          responseFormat: "b64_json",
          logContext: {
            session_id: input.sessionId,
            candidate_index: index + 1,
            candidate_name: candidate.naming.recommended,
            operation: "candidates_generate"
          }
        })
      )
    );

    const supportingImageResults = await Promise.allSettled(
      trimmed.flatMap((candidate, candidateIndex) =>
        (candidate.supporting_assets ?? []).map((asset, assetIndex) =>
          generateOpenAiImageUrl({
            prompt: asset.prompt,
            size: "1024x1024",
            responseFormat: "b64_json",
            logContext: {
              session_id: input.sessionId,
              candidate_index: candidateIndex + 1,
              candidate_name: candidate.naming.recommended,
              supporting_asset_index: assetIndex + 1,
              supporting_asset_kind: asset.kind,
              operation: "candidates_generate_supporting"
            }
          })
        )
      )
    );

    const renderFailures: Array<{
      candidate_id: string;
      candidate_name: string;
      error: string;
      fallback_used: boolean;
    }> = [];

    const heroImages = trimmed.map((candidate, index) => {
      const result = heroImageResults[index];
      if (result.status === "fulfilled") {
        return result.value;
      }

      const error = truncateForLog(toLoggableError(result.reason));
      renderFailures.push({
        candidate_id: `cand_${index + 1}`,
        candidate_name: candidate.naming.recommended,
        error,
        fallback_used: true
      });
      logOpenAiFailure("[openai.candidates.image_fallback]", {
        session_id: input.sessionId,
        candidate_index: index + 1,
        candidate_name: candidate.naming.recommended,
        model: env.OPENAI_MODEL_IMAGE,
        error
      });
      return toMockCandidateImageUrl({
        candidateName: candidate.naming.recommended,
        headline: candidate.ui_plan.headline,
        narrative: candidate.narrative_summary,
        colors: candidate.moodboard.colors
      });
    });

    const supportingImagesByCandidate = trimmed.map((candidate, candidateIndex) => {
      const candidateAssets = candidate.supporting_assets ?? [];
      return candidateAssets.map((asset, assetIndex) => {
        const resultIndex = candidateIndex * candidateAssets.length + assetIndex;
        const result = supportingImageResults[resultIndex];
        if (result?.status === "fulfilled") {
          return {
            id: `asset_${assetIndex + 1}`,
            kind: asset.kind,
            title: asset.title,
            prompt: asset.prompt,
            image_url: result.value
          };
        }

        const error = truncateForLog(
          result && result.status === "rejected" ? toLoggableError(result.reason) : "Supporting asset render failed."
        );
        renderFailures.push({
          candidate_id: `cand_${candidateIndex + 1}`,
          candidate_name: candidate.naming.recommended,
          error: `${asset.kind}:${error}`,
          fallback_used: true
        });
        logOpenAiFailure("[openai.candidates.image_fallback]", {
          session_id: input.sessionId,
          candidate_index: candidateIndex + 1,
          candidate_name: candidate.naming.recommended,
          supporting_asset_index: assetIndex + 1,
          supporting_asset_kind: asset.kind,
          model: env.OPENAI_MODEL_IMAGE,
          error
        });
        return {
          id: `asset_${assetIndex + 1}`,
          kind: asset.kind,
          title: asset.title,
          prompt: asset.prompt,
          image_url: toMockSupportingAssetImageUrl({
            candidateName: candidate.naming.recommended,
            assetTitle: asset.title,
            prompt: asset.prompt,
            colors: candidate.moodboard.colors
          })
        };
      });
    });

    return {
      candidates: trimmed.map((candidate, index) =>
        toCandidate(index, candidate, heroImages[index], supportingImagesByCandidate[index] ?? [])
      ),
      source: "openai",
      usage: {
        text: parsed.usage,
        image_generations: trimmed.reduce((count, candidate) => count + 1 + (candidate.supporting_assets ?? []).length, 0)
      },
      render_failures: renderFailures
    };
  } catch (error) {
    logOpenAiFailure("[openai.candidates.failed]", {
      session_id: input.sessionId,
      model_text: env.OPENAI_MODEL_TEXT,
      model_image: env.OPENAI_MODEL_IMAGE,
      error: truncateForLog(toLoggableError(error))
    });
    if (env.OPENAI_FALLBACK_MODE !== "deterministic_mock") {
      throw error;
    }
    const fallback = generateDeterministicCandidates({
      sessionId: input.sessionId,
      product: input.product,
      audience: input.audience,
      styleKeywords: input.styleKeywords,
      variationWidth,
      candidateCount
    });
    return {
      candidates: selectTopCandidates(fallback, topK),
      source: "mock",
      usage: {
        text: null,
        image_generations: 0
      },
      render_failures: []
    };
  }
}

export function generateFollowupSocialAsset(input: {
  candidate: Candidate;
  assetType: "social_x" | "social_ig" | "social_story";
}): { title: string; caption: string; hashtags: string[] } {
  const assetTitle =
    input.assetType === "social_story"
      ? "Story concept"
      : input.assetType === "social_ig"
        ? "Instagram post concept"
        : "X post concept";
  const caption = `${input.candidate.naming.recommended}: ${input.candidate.narrative_summary}`;
  const hashtags = [
    "#branddirection",
    "#uiidentity",
    `#${input.candidate.naming.recommended.toLowerCase()}`,
    "#ab_aurora",
    "#top3"
  ];
  return {
    title: assetTitle,
    caption,
    hashtags
  };
}

export async function generateSocialAssetsWithFallback(input: {
  sessionId: string;
  candidate: Candidate;
}): Promise<{
  post_1200x675: string;
  post_1080x1080: string;
  post_1080x1920: string;
  captions: string[];
  source: "openai" | "mock";
  model: string;
}> {
  const captions = [
    `${input.candidate.naming.recommended} - launch your brand direction from a ranked Top-3.`,
    `Selected candidate ${input.candidate.rank}: now converted to tokens and build plan.`
  ];

  const mockAssets = {
    post_1200x675: toMockSocialAssetUrl({
      sessionId: input.sessionId,
      key: "post_1200x675"
    }),
    post_1080x1080: toMockSocialAssetUrl({
      sessionId: input.sessionId,
      key: "post_1080x1080"
    }),
    post_1080x1920: toMockSocialAssetUrl({
      sessionId: input.sessionId,
      key: "post_1080x1920"
    }),
    captions,
    source: "mock" as const,
    model: env.OPENAI_MODEL_IMAGE
  };

  if (!env.OPENAI_API_KEY) {
    return mockAssets;
  }

  try {
    const generated = await Promise.all(
      SOCIAL_IMAGE_SPECS.map(async (spec) => {
        const url = await generateOpenAiImageUrl({
          prompt: toSocialAssetPrompt({
            candidate: input.candidate,
            intent: spec.intent
          }),
          size: spec.size,
          responseFormat: "url"
        });
        return [spec.key, url] as const;
      })
    );

    const map = Object.fromEntries(generated) as Record<SocialImageKey, string>;
    return {
      post_1200x675: map.post_1200x675,
      post_1080x1080: map.post_1080x1080,
      post_1080x1920: map.post_1080x1920,
      captions,
      source: "openai",
      model: env.OPENAI_MODEL_IMAGE
    };
  } catch (error) {
    if (env.OPENAI_FALLBACK_MODE !== "deterministic_mock") {
      throw error;
    }
    return mockAssets;
  }
}

function toConversationAssetPrompt(input: {
  product: string;
  audience: string;
  styleKeywords: string[];
  userMessage: string;
  selectedCandidate?: Candidate | null;
  assetType: "social_x" | "social_ig" | "social_story";
}): string {
  const assetIntent =
    input.assetType === "social_story"
      ? "vertical story concept"
      : input.assetType === "social_ig"
        ? "square social concept"
        : "landscape social concept";

  return [
    "Create one polished brand visual based on the active user conversation.",
    "Do not reuse any existing stored image.",
    "No readable text, no watermark, no logos, no UI chrome.",
    `Format intent: ${assetIntent}.`,
    `Product: ${input.product}.`,
    `Audience: ${input.audience}.`,
    `Style keywords: ${input.styleKeywords.join(", ") || "exploratory"}.`,
    input.selectedCandidate ? `Selected candidate name: ${input.selectedCandidate.naming.recommended}.` : null,
    input.selectedCandidate ? `Candidate narrative: ${normalizeLines(input.selectedCandidate.narrative_summary)}.` : null,
    input.selectedCandidate ? `Candidate image prompt seed: ${normalizeLines(input.selectedCandidate.image_prompt)}.` : null,
    input.selectedCandidate?.story?.narrative
      ? `Selected story bundle: ${normalizeLines(input.selectedCandidate.story.narrative)}.`
      : null,
    input.selectedCandidate?.supporting_assets?.length
      ? `Supporting asset cues: ${input.selectedCandidate.supporting_assets
          .map((asset) => `${asset.kind}=${normalizeLines(asset.prompt)}`)
          .join(" | ")}.`
      : null,
    `User request: ${input.userMessage}.`,
    "Translate the request into a single cohesive visual scene with premium lighting and clear subject focus."
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateConversationFollowupAsset(input: {
  product: string;
  audience: string;
  styleKeywords: string[];
  userMessage: string;
  selectedCandidate?: Candidate | null;
  assetType: "social_x" | "social_ig" | "social_story";
}): Promise<{
  image_url: string;
  prompt: string;
  source: "openai" | "mock";
  model: string;
  size: string;
}> {
  const spec =
    input.assetType === "social_story"
      ? SOCIAL_IMAGE_SPECS[2]
      : input.assetType === "social_ig"
        ? SOCIAL_IMAGE_SPECS[1]
        : SOCIAL_IMAGE_SPECS[0];
  const prompt = toConversationAssetPrompt(input);
  if (!env.OPENAI_API_KEY) {
    return {
      image_url: toMockRevisionImageUrl({
        title: input.selectedCandidate?.naming.recommended ?? "Aurora revision",
        prompt,
        colors: input.selectedCandidate?.moodboard.colors
      }),
      prompt,
      source: "mock",
      model: env.OPENAI_MODEL_IMAGE,
      size: spec.size
    };
  }

  try {
    const imageUrl = await generateOpenAiImageUrl({
      prompt,
      size: spec.size,
      responseFormat: "b64_json"
    });

    return {
      image_url: imageUrl,
      prompt,
      source: "openai",
      model: env.OPENAI_MODEL_IMAGE,
      size: spec.size
    };
  } catch (error) {
    if (env.OPENAI_FALLBACK_MODE !== "deterministic_mock") {
      throw error;
    }
    return {
      image_url: toMockRevisionImageUrl({
        title: input.selectedCandidate?.naming.recommended ?? "Aurora revision",
        prompt,
        colors: input.selectedCandidate?.moodboard.colors
      }),
      prompt,
      source: "mock",
      model: env.OPENAI_MODEL_IMAGE,
      size: spec.size
    };
  }
}
