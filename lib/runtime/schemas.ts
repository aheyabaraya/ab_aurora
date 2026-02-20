import { z } from "zod";

export const runtimeGoalTypeSchema = z.enum(["deliver_demo_pack"]);

export const runtimeActionOverrideSchema = z.object({
  action_type: z.string().min(1),
  payload: z.record(z.unknown()).optional()
});

export const runtimeStartRequestSchema = z.object({
  session_id: z.string().min(1),
  goal_type: runtimeGoalTypeSchema.default("deliver_demo_pack"),
  goal_input: z.record(z.unknown()).optional(),
  idempotency_key: z.string().min(8).max(128).optional()
});

export const runtimeStepRequestSchema = z.object({
  goal_id: z.string().min(1),
  force_replan: z.boolean().optional(),
  action_override: runtimeActionOverrideSchema.optional(),
  idempotency_key: z.string().min(8).max(128).optional()
});

export type RuntimeStartRequest = z.infer<typeof runtimeStartRequestSchema>;
export type RuntimeStepRequest = z.infer<typeof runtimeStepRequestSchema>;
export type RuntimeActionOverride = z.infer<typeof runtimeActionOverrideSchema>;
