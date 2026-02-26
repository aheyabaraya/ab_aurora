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

function toMockSocialAssetUrl(input: { sessionId: string; key: SocialImageKey }): string {
  return `generated://${input.sessionId}/social/${input.key}.png`;
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

async function generateOpenAiImageUrl(input: {
  prompt: string;
  size: (typeof SOCIAL_IMAGE_SPECS)[number]["size"];
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
      n: 1
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.text();
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
          size: spec.size
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
