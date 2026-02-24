import type { ChatAction } from "./types";

const NUMBER_PATTERN = /(?:^|\s)([123])(?:번|th|st|nd|rd)?(?:\s|$)/i;

function extractCandidateId(message: string): string | null {
  const match = message.match(NUMBER_PATTERN);
  if (!match) {
    return null;
  }
  return `cand_${match[1]}`;
}

export function parseChatAction(message: string): ChatAction {
  const normalized = message.trim().toLowerCase();

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

  if (normalized.includes("followup") || normalized.includes("소셜") || normalized.includes("후속")) {
    return {
      type: "generate_followup_asset",
      payload: { asset_type: normalized.includes("story") ? "social_story" : "social_x" },
      raw: message
    };
  }

  if (
    normalized.includes("revise") ||
    normalized.includes("수정") ||
    normalized.includes("tone") ||
    normalized.includes("톤")
  ) {
    return {
      type: "revise_constraint",
      payload: { constraint: message },
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

  return { type: "unknown", raw: message };
}
