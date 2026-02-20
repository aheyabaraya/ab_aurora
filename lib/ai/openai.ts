import { z } from "zod";
import { env } from "../env";
import {
  generateDeterministicCandidates,
  selectTopCandidates,
  toVariationWidth
} from "../agent/candidate";
import type { Candidate, VariationWidth } from "../agent/types";

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
        rationale: z.string()
      })
    )
    .min(3)
});

function toCandidate(id: number, item: z.infer<typeof candidateResponseSchema>["candidates"][number]): Candidate {
  return {
    id: `cand_${id + 1}`,
    rank: id + 1,
    score: 0.5,
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
    rationale: item.rationale
  };
}

function promptForCandidates(input: {
  product: string;
  audience: string;
  styleKeywords: string[];
  variationWidth: VariationWidth;
  candidateCount: number;
}): string {
  return [
    "You generate brand direction candidates.",
    `Return JSON only with field "candidates" length ${input.candidateCount}.`,
    "Each candidate must contain naming, moodboard, ui_plan, rationale.",
    `Product: ${input.product}`,
    `Audience: ${input.audience}`,
    `Style keywords: ${input.styleKeywords.join(", ")}`,
    `Variation width: ${input.variationWidth}`,
    "Ensure clear differences across candidates while preserving product-audience fit."
  ].join("\n");
}

export async function generateCandidatesWithFallback(input: {
  sessionId: string;
  product: string;
  audience: string;
  styleKeywords: string[];
  intentConfidence: number;
  candidateCount?: number;
  topK?: number;
}): Promise<{ candidates: Candidate[]; source: "openai" | "mock" }> {
  const candidateCount = input.candidateCount ?? env.CANDIDATE_COUNT;
  const topK = input.topK ?? env.TOP_K;
  const variationWidth = toVariationWidth(input.intentConfidence);
  const hasOpenAiKey = Boolean(env.OPENAI_API_KEY);

  if (!hasOpenAiKey) {
    const fallback = generateDeterministicCandidates({
      sessionId: input.sessionId,
      product: input.product,
      audience: input.audience,
      styleKeywords: input.styleKeywords,
      variationWidth,
      candidateCount
    });
    return { candidates: selectTopCandidates(fallback, topK), source: "mock" };
  }

  try {
    const completionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL_TEXT,
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a brand direction candidate generator." },
          {
            role: "user",
            content: promptForCandidates({
              product: input.product,
              audience: input.audience,
              styleKeywords: input.styleKeywords,
              variationWidth,
              candidateCount
            })
          }
        ]
      }),
      cache: "no-store"
    });

    if (!completionResponse.ok) {
      const errorBody = await completionResponse.text();
      throw new Error(`OpenAI call failed (${completionResponse.status}): ${errorBody}`);
    }
    const completion = (await completionResponse.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty OpenAI response");
    }
    const parsed = candidateResponseSchema.parse(JSON.parse(content));
    const normalized = parsed.candidates.map((item, index) => toCandidate(index, item));
    const topCandidates = selectTopCandidates(normalized, topK);
    return { candidates: topCandidates, source: "openai" };
  } catch (error) {
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
    return { candidates: selectTopCandidates(fallback, topK), source: "mock" };
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
  const caption = `${input.candidate.naming.recommended}: ${input.candidate.rationale}`;
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
