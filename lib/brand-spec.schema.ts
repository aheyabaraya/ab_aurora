import { z } from "zod";

const intentSchema = z.object({
  has_direction: z.boolean(),
  intent_confidence: z.number().int().min(1).max(5),
  variation_width: z.enum(["wide", "medium", "narrow"]),
  direction_source: z.enum(["user", "agent"]).optional()
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
  rationale: z.string()
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
  tokens: z.record(z.unknown()),
  social_assets: z.record(z.unknown()),
  code_plan: z.record(z.unknown()),
  selected_candidate_id: z.string()
});

export const brandSpecSchema = z.union([brandSpecDraftSchema, brandSpecFinalSchema]);

export type BrandSpecDraft = z.infer<typeof brandSpecDraftSchema>;
export type BrandSpecFinal = z.infer<typeof brandSpecFinalSchema>;
export type BrandSpec = z.infer<typeof brandSpecSchema>;
