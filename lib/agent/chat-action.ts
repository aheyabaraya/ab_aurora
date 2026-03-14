import type { ChatAction } from "./types";

const NUMBER_PATTERN = /(?:^|\s)([123])(?:번|th|st|nd|rd)?(?:\s|$)/i;
const IMAGE_REQUEST_KEYWORDS = [
  "image",
  "visual",
  "moodboard",
  "render",
  "mockup",
  "illustration",
  "poster",
  "thumbnail",
  "cover",
  "concept art",
  "show me",
  "이미지",
  "비주얼",
  "무드보드",
  "렌더",
  "목업",
  "일러스트",
  "포스터",
  "썸네일",
  "표지",
  "시안",
  "보여줘"
];

function extractCandidateId(message: string): string | null {
  const match = message.match(NUMBER_PATTERN);
  if (!match) {
    return null;
  }
  return `cand_${match[1]}`;
}

function inferFollowupAssetType(normalized: string): "social_x" | "social_ig" | "social_story" {
  if (
    normalized.includes("story") ||
    normalized.includes("vertical") ||
    normalized.includes("portrait") ||
    normalized.includes("세로")
  ) {
    return "social_story";
  }
  if (
    normalized.includes("instagram") ||
    normalized.includes("insta") ||
    normalized.includes("square") ||
    normalized.includes("정사각")
  ) {
    return "social_ig";
  }
  return "social_x";
}

function looksLikeImageRequest(normalized: string): boolean {
  return IMAGE_REQUEST_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

type ParseChatActionContext = {
  currentStep?: string | null;
  selectedCandidateId?: string | null;
};

export function parseChatAction(message: string, context: ParseChatActionContext = {}): ChatAction {
  const normalized = message.trim().toLowerCase();
  const hasSelection = typeof context.selectedCandidateId === "string" && context.selectedCandidateId.length > 0;

  if (normalized.length === 0) {
    return { type: "unknown", raw: message };
  }

  if (normalized.includes("pause") || normalized.includes("멈춰") || normalized.includes("중지")) {
    return { type: "pause", raw: message };
  }

  if (normalized.includes("resume") || normalized.includes("재개") || normalized.includes("계속")) {
    return { type: "resume", raw: message };
  }

  if (
    looksLikeImageRequest(normalized) ||
    normalized.includes("followup") ||
    normalized.includes("소셜") ||
    normalized.includes("후속")
  ) {
    if (!hasSelection) {
      return {
        type: "refine_direction",
        payload: {
          constraint: message,
          regenerate_candidates: true
        },
        raw: message
      };
    }
    return {
      type: "generate_followup_asset",
      payload: {
        asset_type: inferFollowupAssetType(normalized),
        prompt: message
      },
      raw: message
    };
  }

  if (
    normalized.includes("proceed") ||
    normalized.includes("다음") ||
    normalized.includes("진행") ||
    normalized.includes("build") ||
    normalized.includes("빌드") ||
    normalized.includes("승인")
  ) {
    return { type: "proceed", raw: message };
  }

  if (normalized.includes("rerun") || normalized.includes("다시") || normalized.includes("재생성")) {
    return { type: "rerun_candidates", raw: message };
  }

  if (
    normalized.includes("revise") ||
    normalized.includes("수정") ||
    normalized.includes("tone") ||
    normalized.includes("톤") ||
    normalized.includes("more") ||
    normalized.includes("less")
  ) {
    return {
      type: "refine_direction",
      payload: {
        constraint: message,
        regenerate_candidates: !hasSelection
      },
      raw: message
    };
  }

  const candidateId = extractCandidateId(normalized);
  if (
    candidateId &&
    (normalized.includes("pick") ||
      normalized.includes("select") ||
      normalized.includes("choose") ||
      normalized.includes("선택") ||
      normalized.includes("바꿔"))
  ) {
    return {
      type: "select_candidate",
      payload: { candidate_id: candidateId },
      raw: message
    };
  }

  if (!normalized.startsWith("/")) {
    return {
      type: "refine_direction",
      payload: {
        constraint: message,
        regenerate_candidates: !hasSelection
      },
      raw: message
    };
  }

  return { type: "unknown", raw: message };
}
