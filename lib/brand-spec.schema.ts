import { z } from "zod";

const intentSchema = z.object({
  has_direction: z.boolean(),
  intent_confidence: z.number().int().min(1).max(5),
  variation_width: z.enum(["wide", "medium", "narrow"]),
  direction_source: z.enum(["user", "agent"]).optional()
});

export const brandSpecSchema = z.object({
  version: z.string(),
  mode: z.string(),
  intent: intentSchema,
  input: z.record(z.unknown()),
  persona: z.record(z.unknown()).optional(),
  naming: z.record(z.unknown()).optional(),
  moodboard: z.record(z.unknown()),
  ui_plan: z.record(z.unknown()),
  tokens: z.record(z.unknown()),
  social_assets: z.record(z.unknown()),
  code_plan: z.record(z.unknown()),
  scoring: z.object({
    candidate_count: z.number().int(),
    top_k: z.number().int(),
    rules: z.array(z.string())
  })
});

export type BrandSpec = z.infer<typeof brandSpecSchema>;
