import type { BrandDirection } from "../brand-spec.schema";

function normalizePrompt(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function joinRules(values: string[]): string {
  return values.map((value) => normalizePrompt(value)).filter(Boolean).join(" | ");
}

function supportingRoleLine(assetKind: string): string {
  const kind = normalizePrompt(assetKind).toLowerCase();
  if (kind === "portrait") {
    return "Supporting asset role: identity, face, silhouette, or character study, following the direction's people directive.";
  }
  if (kind === "background") {
    return "Supporting asset role: environment, atmosphere, or spatial backdrop that supports the direction.";
  }
  if (kind === "prop") {
    return "Supporting asset role: one tangible signature object, artifact, or symbolic prop with material presence.";
  }
  return "Supporting asset role: follow the direction and candidate narrative without drifting into abstract moodboard treatment.";
}

export function buildDirectionLedHeroPrompt(input: {
  direction: BrandDirection;
  product: string;
  audience: string;
  candidateName?: string | null;
  candidateNarrative?: string | null;
  candidateAngle?: string | null;
}): string {
  return [
    "Create one finished brand primary image.",
    `Product: ${normalizePrompt(input.product)}.`,
    `Audience: ${normalizePrompt(input.audience)}.`,
    `Direction brief: ${normalizePrompt(input.direction.brief_summary)}.`,
    `Direction narrative: ${normalizePrompt(input.direction.narrative_summary)}.`,
    `Image intent: ${normalizePrompt(input.direction.image_intent)}.`,
    `Prompt seed: ${normalizePrompt(input.direction.prompt_seed)}.`,
    `Asset focus: ${normalizePrompt(input.direction.asset_intent?.focus)}.`,
    `Asset priority: ${(input.direction.asset_intent?.priority_order ?? []).map((value) => normalizePrompt(value)).filter(Boolean).join(" -> ")}.`,
    `Hero subject strategy: ${normalizePrompt(input.direction.hero_subject)}.`,
    `People directive: ${normalizePrompt(input.direction.people_directive)}.`,
    input.candidateName ? `Candidate name: ${normalizePrompt(input.candidateName)}.` : null,
    input.candidateNarrative ? `Candidate narrative: ${normalizePrompt(input.candidateNarrative)}.` : null,
    input.candidateAngle ? `Candidate-specific angle: ${normalizePrompt(input.candidateAngle)}.` : null,
    input.direction.visual_principles.length > 0 ? `Visual principles: ${joinRules(input.direction.visual_principles)}.` : null,
    input.direction.anti_goals.length > 0 ? `Avoid: ${joinRules(input.direction.anti_goals)}.` : null,
    "Render a single finished image, not a moodboard sheet, collage, style board, or abstract prompt board."
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildDirectionLedSupportingPrompt(input: {
  direction: BrandDirection;
  product: string;
  audience: string;
  candidateName: string;
  candidateNarrative?: string | null;
  assetKind: string;
  assetTitle?: string | null;
  candidateAngle?: string | null;
}): string {
  return [
    `Create one finished ${normalizePrompt(input.assetKind)} supporting asset for ${normalizePrompt(input.candidateName)}.`,
    input.assetTitle ? `Asset title: ${normalizePrompt(input.assetTitle)}.` : null,
    `Product: ${normalizePrompt(input.product)}.`,
    `Audience: ${normalizePrompt(input.audience)}.`,
    `Direction brief: ${normalizePrompt(input.direction.brief_summary)}.`,
    `Direction narrative: ${normalizePrompt(input.direction.narrative_summary)}.`,
    `Image intent: ${normalizePrompt(input.direction.image_intent)}.`,
    `Prompt seed: ${normalizePrompt(input.direction.prompt_seed)}.`,
    `Asset focus: ${normalizePrompt(input.direction.asset_intent?.focus)}.`,
    `Asset priority: ${(input.direction.asset_intent?.priority_order ?? []).map((value) => normalizePrompt(value)).filter(Boolean).join(" -> ")}.`,
    `Hero subject strategy: ${normalizePrompt(input.direction.hero_subject)}.`,
    `People directive: ${normalizePrompt(input.direction.people_directive)}.`,
    input.candidateNarrative ? `Candidate narrative: ${normalizePrompt(input.candidateNarrative)}.` : null,
    input.candidateAngle ? `Candidate-specific angle: ${normalizePrompt(input.candidateAngle)}.` : null,
    input.direction.visual_principles.length > 0 ? `Visual principles: ${joinRules(input.direction.visual_principles)}.` : null,
    input.direction.anti_goals.length > 0 ? `Avoid: ${joinRules(input.direction.anti_goals)}.` : null,
    supportingRoleLine(input.assetKind),
    "Render a single finished image, not a cropped moodboard fragment, collage, or abstract reference board."
  ]
    .filter(Boolean)
    .join("\n");
}
