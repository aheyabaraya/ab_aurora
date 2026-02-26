process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.OPENAI_MODEL_TEXT = "gpt-4o";
process.env.CHAT_OPENAI_MAX_TOKENS = "220";
process.env.CHAT_OPENAI_TEMPERATURE = "0.2";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildFallbackAssistantReply,
  buildRateLimitedAssistantReply,
  generateAssistantChatReply
} = require("../../.tmp-tests/lib/ai/openai-chat.js");

test("generateAssistantChatReply sends compact prompt with option hints", async () => {
  let capturedInit = null;
  global.fetch = async (_url, init) => {
    capturedInit = init;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "현재 단계 요약입니다. 추천 명령은 /run 입니다."
            }
          }
        ]
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  };

  const reply = await generateAssistantChatReply({
    userMessage: "2번으로 바꿔줘",
    actionType: "select_candidate",
    pipelineMessage: "Applied select_candidate.",
    sessionSnapshot: {
      current_step: "top3_select",
      status: "wait_user",
      product: "AB Aurora",
      audience: "builders",
      style_keywords: ["editorial", "calm"],
      selected_candidate_id: null,
      auto_pick_top1: false
    },
    optionHints: [
      {
        command: "/pick 2",
        title: "Noxline",
        description: "조용한 의식적 무드를 강화합니다."
      },
      {
        command: "/build",
        title: "Build confirm",
        description: "approve_build를 확정 진행합니다."
      }
    ]
  });

  assert.equal(reply.includes("/run"), true);
  assert.ok(capturedInit);
  const requestBody = JSON.parse(capturedInit.body);
  assert.equal(requestBody.max_tokens, 220);
  assert.equal(requestBody.temperature, 0.2);
  assert.equal(requestBody.messages[1].content.includes("답변은 한국어로 작성하세요."), true);
  assert.equal(requestBody.messages[1].content.includes("Option hints:"), true);
  assert.equal(requestBody.messages[1].content.includes("/pick 2"), true);
});

test("rate-limited and fallback replies keep pipeline summary and options", () => {
  const optionHints = [
    {
      command: "/run",
      title: "Continue",
      description: "다음 stage를 진행합니다."
    }
  ];

  const rateLimited = buildRateLimitedAssistantReply({
    pipelineMessage: "Top-3 generated.",
    optionHints
  });
  assert.equal(rateLimited.includes("한도"), true);
  assert.equal(rateLimited.includes("Top-3 generated."), true);
  assert.equal(rateLimited.includes("/run"), true);

  const fallback = buildFallbackAssistantReply({
    pipelineMessage: "Selection applied.",
    optionHints
  });
  assert.equal(fallback.includes("실패"), true);
  assert.equal(fallback.includes("Selection applied."), true);
  assert.equal(fallback.includes("/run"), true);
});
