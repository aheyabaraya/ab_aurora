import { z } from "zod";

const stepSchema = z.enum([
  "interview_collect",
  "intent_gate",
  "spec_draft",
  "brand_narrative",
  "candidates_generate",
  "top3_select",
  "approve_build",
  "package",
  "done"
]);

const actionSchema = z.enum([
  "revise_constraint",
  "rerun_candidates",
  "select_candidate",
  "proceed",
  "pause",
  "resume",
  "generate_followup_asset",
  "unknown"
]);

export const seedPresetSchema = z.enum([
  "fresh",
  "top3_ready",
  "selected_ready",
  "build_confirm_required",
  "package_ready",
  "done"
]);

export const sessionStartRequestSchema = z.object({
  mode: z.enum(["mode_a", "mode_b"]),
  product: z.string().min(3).max(240),
  audience: z.string().min(3).max(240),
  style_keywords: z.array(z.string().min(1).max(64)).min(1).max(10),
  q0_intent_confidence: z.number().int().min(1).max(5).optional(),
  auto_continue: z.boolean().optional(),
  auto_pick_top1: z.boolean().optional()
});

export const runStepRequestSchema = z.object({
  session_id: z.string().min(1),
  step: stepSchema.optional(),
  action: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
  idempotency_key: z.string().min(8).max(128)
});

export const chatRequestSchema = z.object({
  session_id: z.string().min(1),
  message: z.string().min(1).max(500)
});

export const reviseRequestSchema = z.object({
  session_id: z.string().min(1),
  constraint: z.string().min(1).max(300),
  intensity: z.number().int().min(1).max(100).optional()
});

export const selectCandidatePayloadSchema = z.object({
  candidate_id: z.string().min(1)
});

export const followupAssetPayloadSchema = z.object({
  asset_type: z.enum(["social_x", "social_ig", "social_story"]).default("social_x")
});

export const mintRequestSchema = z.object({
  pack_id: z.string().min(1)
});

export const artifactContentSchema = z.record(z.unknown());

export const chatActionSchema = z.object({
  type: actionSchema,
  payload: z.record(z.unknown()).optional(),
  raw: z.string()
});

export const seedSessionRequestSchema = z.object({
  preset: seedPresetSchema.default("fresh"),
  mode: z.enum(["mode_a", "mode_b"]).optional(),
  product: z.string().min(3).max(240).optional(),
  audience: z.string().min(3).max(240).optional(),
  style_keywords: z.array(z.string().min(1).max(64)).min(1).max(10).optional(),
  auto_continue: z.boolean().optional(),
  auto_pick_top1: z.boolean().optional(),
  with_runtime_goal: z.boolean().optional()
});

export type SessionStartRequest = z.infer<typeof sessionStartRequestSchema>;
export type RunStepRequestBody = z.infer<typeof runStepRequestSchema>;
export type ChatRequestBody = z.infer<typeof chatRequestSchema>;
export type ReviseRequestBody = z.infer<typeof reviseRequestSchema>;
export type MintRequestBody = z.infer<typeof mintRequestSchema>;
export type SeedSessionPreset = z.infer<typeof seedPresetSchema>;
export type SeedSessionRequestBody = z.infer<typeof seedSessionRequestSchema>;
