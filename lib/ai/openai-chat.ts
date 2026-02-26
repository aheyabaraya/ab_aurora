import { env } from "../env";

export type ChatOptionHint = {
  command: string;
  title: string;
  description: string;
};

type AssistantChatReplyInput = {
  userMessage: string;
  actionType: string;
  pipelineMessage: string;
  sessionSnapshot: {
    current_step: string;
    status: string;
    product: string;
    audience: string;
    style_keywords: string[];
    selected_candidate_id: string | null;
    auto_pick_top1: boolean;
  };
  optionHints: ChatOptionHint[];
};

function formatHints(hints: ChatOptionHint[]): string {
  if (hints.length === 0) {
    return "- /run: 다음 stage를 실행합니다.";
  }
  return hints.map((hint) => `- ${hint.command}: ${hint.title} (${hint.description})`).join("\n");
}

function isKoreanPreferred(message: string): boolean {
  return /[가-힣]/.test(message);
}

function summarizePipelineMessage(raw: string): string {
  const compact = raw.trim().replace(/\s+/g, " ");
  if (compact.length === 0) {
    return "상태 정보를 받지 못했습니다.";
  }

  const schemaError =
    compact.includes("invalid_type") ||
    compact.includes("Expected object, received") ||
    (compact.includes("candidates") && compact.includes("ui_plan"));
  if (schemaError) {
    return "후보 생성 결과가 요구 스키마와 일치하지 않아 검증에 실패했습니다. /run 으로 재시도하세요.";
  }

  if (compact.length > 260) {
    return `${compact.slice(0, 260)}...`;
  }
  return compact;
}

export async function generateAssistantChatReply(input: AssistantChatReplyInput): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for OpenAI chat replies.");
  }

  const languageGuide = isKoreanPreferred(input.userMessage)
    ? "답변은 한국어로 작성하세요."
    : "Reply in English.";
  const pipelineSummary = summarizePipelineMessage(input.pipelineMessage);

  const prompt = [
    languageGuide,
    "너는 AB Aurora의 실행 어시스턴트다.",
    "출력은 짧고 실행 중심으로 작성한다.",
    "반드시 포함:",
    "1) 현재 상태 요약 1문장",
    "2) 추천 명령 1개",
    "3) 가능한 선택지 2~5개와 각 의미",
    "4) 지금 바로 할 행동 1문장",
    "",
    `User message: ${input.userMessage}`,
    `Interpreted action: ${input.actionType}`,
    `Pipeline message: ${pipelineSummary}`,
    `Session snapshot: ${JSON.stringify(input.sessionSnapshot)}`,
    "Option hints:",
    formatHints(input.optionHints)
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL_TEXT,
      temperature: env.CHAT_OPENAI_TEMPERATURE,
      max_tokens: env.CHAT_OPENAI_MAX_TOKENS,
      messages: [
        {
          role: "system",
          content: "You are a concise command-first UX assistant for stage-based product generation."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI chat call failed (${response.status}): ${errorText}`);
  }

  const body = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI chat returned empty content.");
  }
  return content;
}

export function buildRateLimitedAssistantReply(input: {
  pipelineMessage: string;
  optionHints: ChatOptionHint[];
}): string {
  const head = "요청은 처리되었지만 OpenAI 채팅 한도에 도달했습니다. 잠시 후 다시 시도해주세요.";
  const options = formatHints(input.optionHints);
  return `${head}\n\n상태: ${summarizePipelineMessage(input.pipelineMessage)}\n\n지금 가능한 명령:\n${options}`;
}

export function buildFallbackAssistantReply(input: {
  pipelineMessage: string;
  optionHints: ChatOptionHint[];
}): string {
  const options = formatHints(input.optionHints);
  return [
    "일시적으로 OpenAI 응답 생성에 실패했습니다. 실행 결과를 기준으로 계속 진행할 수 있습니다.",
    `상태: ${summarizePipelineMessage(input.pipelineMessage)}`,
    "",
    "선택 가능한 명령:",
    options
  ].join("\n");
}
