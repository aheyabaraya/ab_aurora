import { z } from "zod";

export const onboardingStartRequestSchema = z.object({
  state: z.string().min(16).max(256),
  nonce: z.string().min(16).max(256),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256").default("S256"),
  redirect_uri: z.string().url().max(500)
});

export const onboardingExchangeRequestSchema = z.object({
  state: z.string().min(16).max(256),
  nonce: z.string().min(16).max(256),
  code: z.string().min(16).max(256),
  code_verifier: z.string().min(43).max(256)
});

export const mockEntitlementMutationSchema = z.object({
  user_id: z.string().uuid(),
  entitlement_key: z.string().min(1).default("aurora.access"),
  status: z.enum(["active", "revoked"]).default("revoked")
});
