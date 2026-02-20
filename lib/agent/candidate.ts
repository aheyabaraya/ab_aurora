import { env } from "../env";
import { sha256 } from "../utils/hash";
import type { Candidate, VariationWidth } from "./types";

const COLOR_PRESETS = [
  ["#0B1020", "#1F3A5F", "#B6D9F5"],
  ["#101820", "#5B8A72", "#F2AA4C"],
  ["#0F172A", "#2563EB", "#E2E8F0"],
  ["#1B1B1B", "#A3E635", "#D9F99D"],
  ["#2A1E5C", "#C084FC", "#F5D0FE"],
  ["#102A43", "#2CB1BC", "#E0FCFF"],
  ["#2D1E2F", "#F97068", "#FED9B7"],
  ["#2B2D42", "#8D99AE", "#EDF2F4"],
  ["#1B4332", "#52B788", "#D8F3DC"],
  ["#2A2A72", "#009FFD", "#FFA400"]
];

const LAYOUT_PRESETS = [
  ["hero", "proof-strip", "feature-grid", "cta-footer"],
  ["hero", "use-case-cards", "testimonial-row", "cta-bar"],
  ["split-hero", "metrics", "workflow-steps", "final-cta"],
  ["hero", "comparison-table", "faq", "bottom-cta"],
  ["hero", "persona-cards", "roadmap", "signup-cta"]
];

const CTA_PRESETS = [
  "Start the design sprint",
  "Generate my brand pack",
  "Preview top candidate",
  "Lock this visual direction",
  "Publish this concept"
];

const RATIONALE_SUFFIX = [
  "prioritizes clarity for first-time users.",
  "keeps emotional tone aligned with product promise.",
  "balances creator taste with audience trust signals.",
  "emphasizes conversion actions above decorative elements.",
  "retains flexibility for later iteration."
];

function makeRng(seedText: string): () => number {
  const hash = sha256(seedText);
  let state = Number.parseInt(hash.slice(0, 8), 16) || 1;
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function pick<T>(rng: () => number, values: T[]): T {
  const index = Math.floor(rng() * values.length);
  return values[index];
}

function deriveVariationBoost(variationWidth: VariationWidth): number {
  if (variationWidth === "wide") {
    return 0.2;
  }
  if (variationWidth === "medium") {
    return 0.1;
  }
  return 0.04;
}

function makeNamingSeed(product: string, index: number): string[] {
  const base = product.trim().split(/\s+/).slice(0, 2).join("");
  const left = `${base}Nova${index + 1}`;
  const mid = `${base}Pulse${index + 1}`;
  const right = `${base}Arc${index + 1}`;
  return [left, mid, right];
}

function scoreCandidate(input: {
  candidate: Candidate;
  styleKeywords: string[];
  audience: string;
  variationWidth: VariationWidth;
}): number {
  const keywordSignal = input.styleKeywords.reduce((acc, keyword) => {
    const normalized = keyword.toLowerCase();
    const hit =
      input.candidate.moodboard.prompt.toLowerCase().includes(normalized) ||
      input.candidate.ui_plan.headline.toLowerCase().includes(normalized);
    return acc + (hit ? 1 : 0);
  }, 0);
  const audienceSignal = input.candidate.rationale.toLowerCase().includes(input.audience.toLowerCase())
    ? 1
    : 0.5;
  const variationBoost = deriveVariationBoost(input.variationWidth);
  const base = 0.45 + keywordSignal * 0.12 + audienceSignal * 0.08 + variationBoost;
  return Number(Math.min(0.99, base).toFixed(3));
}

export function toVariationWidth(intentConfidence: number): VariationWidth {
  if (intentConfidence <= 2) {
    return "wide";
  }
  if (intentConfidence === 3) {
    return "medium";
  }
  return "narrow";
}

export function generateDeterministicCandidates(input: {
  sessionId: string;
  product: string;
  audience: string;
  styleKeywords: string[];
  variationWidth: VariationWidth;
  candidateCount?: number;
}): Candidate[] {
  const candidateCount = input.candidateCount ?? env.CANDIDATE_COUNT;
  const rng = makeRng(
    `${input.sessionId}:${input.product}:${input.audience}:${input.styleKeywords.join(",")}:${input.variationWidth}`
  );

  const candidates: Candidate[] = [];
  for (let index = 0; index < candidateCount; index += 1) {
    const namingCandidates = makeNamingSeed(input.product, index);
    const colors = pick(rng, COLOR_PRESETS);
    const layout = pick(rng, LAYOUT_PRESETS);
    const cta = pick(rng, CTA_PRESETS);
    const suffix = pick(rng, RATIONALE_SUFFIX);
    const keywordHint = input.styleKeywords[index % input.styleKeywords.length];
    const headline = `${input.product} for ${input.audience}`;
    const candidate: Candidate = {
      id: `cand_${index + 1}`,
      rank: index + 1,
      score: 0,
      naming: {
        recommended: namingCandidates[0],
        candidates: namingCandidates
      },
      moodboard: {
        title: `${keywordHint.toUpperCase()} Direction ${index + 1}`,
        prompt: `${input.product} brand mood, ${keywordHint}, tailored for ${input.audience}, ${input.variationWidth} exploration`,
        colors
      },
      ui_plan: {
        headline,
        layout,
        cta
      },
      rationale: `${input.product} for ${input.audience} ${suffix}`
    };
    candidate.score = scoreCandidate({
      candidate,
      styleKeywords: input.styleKeywords,
      audience: input.audience,
      variationWidth: input.variationWidth
    });
    candidates.push(candidate);
  }

  return candidates;
}

export function selectTopCandidates(candidates: Candidate[], topK: number): Candidate[] {
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  return ranked.slice(0, topK).map((candidate, index) => ({
    ...candidate,
    rank: index + 1
  }));
}
