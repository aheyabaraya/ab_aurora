import { z } from "zod";

const intentSchema = z.object({
  has_direction: z.boolean(),
  intent_confidence: z.number().int().min(1).max(5),
  variation_width: z.enum(["wide", "medium", "narrow"]),
  direction_source: z.enum(["user", "agent"]).optional()
});

const supportingAssetSchema = z.object({
  id: z.string().default("asset_1"),
  kind: z.string(),
  title: z.string(),
  prompt: z.string(),
  image_url: z.string().default("")
});

const candidateStorySchema = z.object({
  premise: z.string(),
  narrative: z.string(),
  asset_rationale: z.string()
});

const candidateSchema = z.object({
  id: z.string(),
  rank: z.number().int().min(1),
  score: z.number(),
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
  image_url: z.string(),
  supporting_assets: z.array(supportingAssetSchema).default([]),
  story: candidateStorySchema.default({
    premise: "",
    narrative: "",
    asset_rationale: ""
  }),
  revision_basis: z.string().nullable().optional()
});

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

export const brandDirectionSchema = z.object({
  brief_summary: z.string(),
  brand_promise: z.string(),
  audience_tension: z.string(),
  narrative_summary: z.string(),
  voice_principles: z.array(z.string()).min(2),
  anti_goals: z.array(z.string()).min(2),
  visual_principles: z.array(z.string()).min(3),
  image_intent: z.string(),
  prompt_seed: z.string(),
  hero_subject: z.string().default("Use one clear focal subject with readable scale, depth, and composition."),
  people_directive: z.string().default("People are optional. Follow the brief and direction rather than a default portrait bias."),
  next_question: z.string(),
  asset_intent: directionAssetIntentSchema.default({
    focus: "balanced",
    rationale: "Start with one clear focal scene, then support it with environmental context and one signature detail.",
    priority_order: ["background", "prop", "portrait"],
    default_bundle: "balanced focal scene + environment + signature detail",
    defaults_applied: true,
    question: "What are you trying to make first: a landing hero, social post, poster, product visual, or something else?"
  }),
  clarity: directionClaritySchema.default({
    score: 3,
    ready_for_concepts: false,
    summary: "Aurora needs a clearer brief before concept generation.",
    missing_inputs: [],
    followup_questions: []
  })
});

const baseBrandSpecSchema = z.object({
  version: z.string(),
  mode: z.string(),
  intent: intentSchema,
  input: z.record(z.unknown()),
  persona: z.record(z.unknown()).optional(),
  naming: z.record(z.unknown()).optional(),
  moodboard: z.record(z.unknown()).optional(),
  ui_plan: z.record(z.unknown()).optional(),
  direction: brandDirectionSchema.optional(),
  tokens: z.record(z.unknown()).optional(),
  social_assets: z.record(z.unknown()).optional(),
  code_plan: z.record(z.unknown()).optional(),
  scoring: z.object({
    candidate_count: z.number().int(),
    top_k: z.number().int(),
    rules: z.array(z.string())
  }),
  candidates: z.array(candidateSchema).optional(),
  selected_candidate_id: z.string().optional()
});

export const brandSpecDraftSchema = baseBrandSpecSchema.extend({
  stage: z.literal("draft")
});

export const brandSpecFinalSchema = baseBrandSpecSchema.extend({
  stage: z.literal("final"),
  moodboard: z.record(z.unknown()),
  ui_plan: z.record(z.unknown()),
  direction: brandDirectionSchema,
  tokens: z.record(z.unknown()),
  social_assets: z.record(z.unknown()),
  code_plan: z.record(z.unknown()),
  selected_candidate_id: z.string()
});

export const brandSpecSchema = z.union([brandSpecDraftSchema, brandSpecFinalSchema]);

export type BrandSpecDraft = z.infer<typeof brandSpecDraftSchema>;
export type BrandSpecFinal = z.infer<typeof brandSpecFinalSchema>;
export type BrandSpec = z.infer<typeof brandSpecSchema>;
export type BrandDirection = z.infer<typeof brandDirectionSchema>;
