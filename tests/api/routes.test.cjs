process.env.NODE_ENV = "test";
process.env.RUNTIME_ENABLED = "true";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.CHAT_OPENAI_LIMIT_PER_DAY = "2";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AUTH_TEST_USER_ID,
  createAuthFetchMock,
  authJsonHeaders
} = require("../helpers/auth-fetch.cjs");

const CHAT_ROUTE_PATH = "../../.tmp-tests/app/api/chat/route.js";
const SESSION_START_ROUTE_PATH = "../../.tmp-tests/app/api/session/start/route.js";
const RUN_STEP_ROUTE_PATH = "../../.tmp-tests/app/api/agent/run-step/route.js";
const SESSION_GET_ROUTE_PATH = "../../.tmp-tests/app/api/sessions/[sessionId]/route.js";
const GUARDS_MODULE_PATH = "../../.tmp-tests/lib/auth/guards.js";
const ONBOARDING_SERVICE_PATH = "../../.tmp-tests/lib/onboarding/service.js";
const ENV_MODULE_PATH = "../../.tmp-tests/lib/env.js";
const STORAGE_INDEX_PATH = "../../.tmp-tests/lib/storage/index.js";

function createCandidatePayload() {
  return {
    candidates: [
      {
        naming: {
          recommended: "Astra",
          candidates: ["Astra", "Auralis"]
        },
        moodboard: {
          title: "Orbital calm",
          prompt: "deep navy with calm cyan accents",
          colors: ["#0a1022", "#0d1f3d", "#5ed6e5"]
        },
        ui_plan: {
          headline: "Build in calm momentum",
          layout: ["hero", "proof", "cta"],
          cta: "Start now"
        },
        rationale: "Balanced premium tone for focused builders."
      },
      {
        naming: {
          recommended: "Noxline",
          candidates: ["Noxline", "Nightrail"]
        },
        moodboard: {
          title: "Nocturne ritual",
          prompt: "ritual mood with low contrast gradients",
          colors: ["#090d18", "#1a2235", "#c6a65d"]
        },
        ui_plan: {
          headline: "Ritualized launches",
          layout: ["hero", "gallery", "faq"],
          cta: "Generate pack"
        },
        rationale: "Quiet ritual framing with restrained luxury."
      },
      {
        naming: {
          recommended: "Helixplain",
          candidates: ["Helixplain", "Plainloop"]
        },
        moodboard: {
          title: "Editorial structure",
          prompt: "editorial typography and clean geometry",
          colors: ["#0f172a", "#1f2937", "#38bdf8"]
        },
        ui_plan: {
          headline: "Editorial by default",
          layout: ["hero", "features", "social"],
          cta: "Open builder"
        },
        rationale: "Clear hierarchy for conversion-focused storytelling."
      }
    ]
  };
}

function mockOpenAiFetch(input = {}) {
  const failChat = input.failChat === true;
  return async (_url, init) => {
    const targetUrl = typeof _url === "string" ? _url : _url instanceof URL ? _url.toString() : String(_url);
    if (targetUrl.includes("/images/generations")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              url: "https://example.com/mock-social-image.png"
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const body = JSON.parse(init?.body ?? "{}");
    const systemMessage = body.messages?.[0]?.content ?? "";
    const isCandidateCall =
      typeof systemMessage === "string" && systemMessage.includes("brand direction candidate generator");

    if (isCandidateCall) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(createCandidatePayload())
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (failChat) {
      return new Response("openai temporary failure", { status: 500 });
    }

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                "현재 단계를 유지하며 진행합니다. 추천 명령은 /run 입니다. 필요하면 /pick 1 또는 /build 를 선택하세요."
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
}

function clearCachedModules(modulePaths) {
  for (const modulePath of modulePaths) {
    try {
      const resolved = require.resolve(modulePath);
      delete require.cache[resolved];
    } catch {
      // Ignore when unresolved.
    }
  }
}

function restoreEnv(saved) {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function loadHandlersWithEnv(envPatch = {}) {
  const saved = {};
  for (const [key, value] of Object.entries(envPatch)) {
    saved[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  clearCachedModules([
    CHAT_ROUTE_PATH,
    SESSION_START_ROUTE_PATH,
    RUN_STEP_ROUTE_PATH,
    SESSION_GET_ROUTE_PATH,
    GUARDS_MODULE_PATH,
    ONBOARDING_SERVICE_PATH,
    STORAGE_INDEX_PATH,
    ENV_MODULE_PATH
  ]);

  const handlers = {
    startSession: require(SESSION_START_ROUTE_PATH).POST,
    runStep: require(RUN_STEP_ROUTE_PATH).POST,
    chatRoute: require(CHAT_ROUTE_PATH).POST,
    getSession: require(SESSION_GET_ROUTE_PATH).GET
  };
  restoreEnv(saved);
  return handlers;
}

const defaultHandlers = loadHandlersWithEnv({
  NODE_ENV: "test",
  RUNTIME_ENABLED: "true",
  OPENAI_API_KEY: "test-openai-key",
  CHAT_OPENAI_LIMIT_PER_DAY: "2"
});

const { startSession, runStep, chatRoute, getSession } = defaultHandlers;

async function json(response) {
  return await response.json();
}

function findAssistantMessageBySource(messages, source) {
  return messages.find(
    (message) =>
      message.role === "assistant" &&
      message.metadata &&
      typeof message.metadata === "object" &&
      message.metadata.assistant_source === source
  );
}

test.before(() => {
  global.fetch = createAuthFetchMock({
    userId: AUTH_TEST_USER_ID,
    hasAuroraAccess: true,
    onboardingComplete: true,
    delegate: mockOpenAiFetch()
  });
});

test("session start route returns initial session data", async () => {
  const request = new Request("http://localhost/api/session/start", {
    method: "POST",
    headers: authJsonHeaders(),
    body: JSON.stringify({
      mode: "mode_b",
      product: "AB Aurora Direction Engine For Product Teams",
      audience: "Vibe coders",
      style_keywords: ["bold", "minimal", "future"],
      design_direction_note: "Keep serif hierarchy and avoid glossy gradients.",
      q0_intent_confidence: 5,
      auto_continue: true,
      auto_pick_top1: true
    })
  });

  const response = await startSession(request);
  assert.equal(response.status, 200);
  const body = await json(response);
  assert.ok(body.session_id);
  assert.equal(body.current_step, "interview_collect");

  const sessionResponse = await getSession(new Request("http://localhost", { headers: authJsonHeaders() }), {
    params: Promise.resolve({ sessionId: body.session_id })
  });
  const sessionBody = await json(sessionResponse);
  assert.ok(Array.isArray(sessionBody.recent_messages));
  assert.equal(sessionBody.recent_messages[0].role, "system");
  assert.equal(sessionBody.recent_messages[0].content, "Session initialized for stage-based pipeline.");
  assert.equal(sessionBody.session.constraint, "Keep serif hierarchy and avoid glossy gradients.");
  assert.equal(sessionBody.session.intent_confidence, 5);
  assert.equal(sessionBody.session.variation_width, "narrow");
});

test("session start route remains backward compatible when q0 is omitted", async () => {
  const request = new Request("http://localhost/api/session/start", {
    method: "POST",
    headers: authJsonHeaders(),
    body: JSON.stringify({
      mode: "mode_b",
      product: "AB Aurora Direction Engine For Product Teams",
      audience: "Vibe coders",
      style_keywords: ["bold", "minimal", "future"],
      design_direction_note: "Keep serif hierarchy and avoid glossy gradients.",
      auto_continue: true,
      auto_pick_top1: true
    })
  });

  const response = await startSession(request);
  assert.equal(response.status, 200);
  const body = await json(response);
  const sessionResponse = await getSession(new Request("http://localhost", { headers: authJsonHeaders() }), {
    params: Promise.resolve({ sessionId: body.session_id })
  });
  const sessionBody = await json(sessionResponse);
  assert.equal(sessionBody.session.intent_confidence, null);
  assert.equal(sessionBody.session.variation_width, null);
});

test("run-step route executes auto pipeline and stores Top-3", async () => {
  const createRequest = new Request("http://localhost/api/session/start", {
    method: "POST",
    headers: authJsonHeaders(),
    body: JSON.stringify({
      mode: "mode_b",
      product: "AB Aurora Direction Engine For Product Teams",
      audience: "Vibe coders",
      style_keywords: ["bold", "minimal", "future"],
      design_direction_note: "Keep serif hierarchy and avoid glossy gradients.",
      auto_continue: true,
      auto_pick_top1: true
    })
  });
  const createResponse = await startSession(createRequest);
  const sessionPayload = await json(createResponse);

  const runRequest = new Request("http://localhost/api/agent/run-step", {
    method: "POST",
    headers: authJsonHeaders(),
    body: JSON.stringify({
      session_id: sessionPayload.session_id,
      idempotency_key: "idem_route_runstep_001"
    })
  });
  const runResponse = await runStep(runRequest);
  assert.equal(runResponse.status, 200);
  const runBody = await json(runResponse);
  assert.ok(Array.isArray(runBody.latest_top3));
  assert.equal(runBody.latest_top3.length, 3);
  assert.equal(runBody.runtime_meta.enabled, true);

  const sessionResponse = await getSession(new Request("http://localhost", { headers: authJsonHeaders() }), {
    params: Promise.resolve({ sessionId: sessionPayload.session_id })
  });
  const sessionBody = await json(sessionResponse);
  assert.equal(sessionBody.latest_top3.length, 3);
});

test("chat route parses select action and returns openai assistant metadata", async () => {
  const createRequest = new Request("http://localhost/api/session/start", {
    method: "POST",
    headers: authJsonHeaders(),
    body: JSON.stringify({
      mode: "mode_b",
      product: "AB Aurora Direction Engine For Product Teams",
      audience: "Vibe coders",
      style_keywords: ["bold", "minimal", "future"],
      design_direction_note: "Keep serif hierarchy and avoid glossy gradients.",
      auto_continue: true,
      auto_pick_top1: true
    })
  });
  const createResponse = await startSession(createRequest);
  const createBody = await json(createResponse);
  await runStep(
    new Request("http://localhost/api/agent/run-step", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        session_id: createBody.session_id,
        idempotency_key: "idem_route_runstep_002"
      })
    })
  );

  const chatRequest = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: authJsonHeaders(),
    body: JSON.stringify({
      session_id: createBody.session_id,
      message: "2번 후보로 바꿔"
    })
  });
  const chatResponse = await chatRoute(chatRequest);
  assert.equal(chatResponse.status, 200);
  const chatBody = await json(chatResponse);
  assert.equal(chatBody.interpreted_action.type, "select_candidate");
  assert.equal(chatBody.applied, true);
  assert.equal(chatBody.runtime_meta.enabled, true);
  assert.equal(chatBody.assistant_source, "openai");
  assert.equal(chatBody.rate_limited, false);
  assert.equal(typeof chatBody.rate_limit.limit, "number");
  assert.equal(typeof chatBody.rate_limit.used, "number");
  assert.equal(typeof chatBody.rate_limit.remaining, "number");

  const sessionResponse = await getSession(new Request("http://localhost", { headers: authJsonHeaders() }), {
    params: Promise.resolve({ sessionId: createBody.session_id })
  });
  const sessionBody = await json(sessionResponse);
  const openAiAssistant = findAssistantMessageBySource(sessionBody.recent_messages, "openai");
  assert.ok(openAiAssistant);
  assert.equal(typeof openAiAssistant.metadata.rate_limit.limit, "number");
  assert.equal(typeof openAiAssistant.metadata.rate_limit.used, "number");
  assert.equal(typeof openAiAssistant.metadata.rate_limit.remaining, "number");
});

test("chat route returns 503 when OPENAI_API_KEY is not configured", async () => {
  const keylessHandlers = loadHandlersWithEnv({
    NODE_ENV: "test",
    RUNTIME_ENABLED: "true",
    OPENAI_API_KEY: undefined,
    CHAT_OPENAI_LIMIT_PER_DAY: "2"
  });
  global.fetch = createAuthFetchMock({
    userId: AUTH_TEST_USER_ID,
    hasAuroraAccess: true,
    onboardingComplete: true,
    delegate: mockOpenAiFetch()
  });

  const createResponse = await keylessHandlers.startSession(
    new Request("http://localhost/api/session/start", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        mode: "mode_b",
        product: "AB Aurora Direction Engine For Product Teams",
        audience: "Vibe coders",
        style_keywords: ["bold", "minimal", "future"],
        design_direction_note: "Keep serif hierarchy and avoid glossy gradients.",
        auto_continue: true,
        auto_pick_top1: true
      })
    })
  );
  const createBody = await json(createResponse);

  const chatResponse = await keylessHandlers.chatRoute(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        session_id: createBody.session_id,
        message: "pick 1"
      })
    })
  );
  assert.equal(chatResponse.status, 503);
});

test("chat route marks rate-limited responses while continuing action execution", async () => {
  global.fetch = createAuthFetchMock({
    userId: AUTH_TEST_USER_ID,
    hasAuroraAccess: true,
    onboardingComplete: true,
    delegate: mockOpenAiFetch()
  });
  const createResponse = await startSession(
    new Request("http://localhost/api/session/start", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        mode: "mode_b",
        product: "AB Aurora Direction Engine For Product Teams",
        audience: "Vibe coders",
        style_keywords: ["bold", "minimal", "future"],
        design_direction_note: "Keep serif hierarchy and avoid glossy gradients.",
        auto_continue: true,
        auto_pick_top1: true
      })
    })
  );
  const createBody = await json(createResponse);
  await runStep(
    new Request("http://localhost/api/agent/run-step", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        session_id: createBody.session_id,
        idempotency_key: "idem_route_runstep_003"
      })
    })
  );

  const chatPayload = (message) =>
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        session_id: createBody.session_id,
        message
      })
    });

  const first = await json(await chatRoute(chatPayload("pick 1")));
  const second = await json(await chatRoute(chatPayload("pick 2")));
  const thirdResponse = await chatRoute(chatPayload("pick 3"));
  const third = await json(thirdResponse);

  assert.equal(first.assistant_source, "openai");
  assert.equal(second.assistant_source, "openai");
  assert.equal(thirdResponse.status, 200);
  assert.equal(third.assistant_source, "rate_limited");
  assert.equal(third.rate_limited, true);
  assert.equal(third.applied, true);

  const sessionResponse = await getSession(new Request("http://localhost", { headers: authJsonHeaders() }), {
    params: Promise.resolve({ sessionId: createBody.session_id })
  });
  const sessionBody = await json(sessionResponse);
  const rateLimitedAssistant = findAssistantMessageBySource(sessionBody.recent_messages, "rate_limited");
  assert.ok(rateLimitedAssistant);
  assert.equal(rateLimitedAssistant.metadata.rate_limited, true);
});

test("chat route falls back when OpenAI returns error", async () => {
  global.fetch = createAuthFetchMock({
    userId: AUTH_TEST_USER_ID,
    hasAuroraAccess: true,
    onboardingComplete: true,
    delegate: mockOpenAiFetch()
  });
  const createResponse = await startSession(
    new Request("http://localhost/api/session/start", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        mode: "mode_b",
        product: "AB Aurora Direction Engine For Product Teams",
        audience: "Vibe coders",
        style_keywords: ["bold", "minimal", "future"],
        design_direction_note: "Keep serif hierarchy and avoid glossy gradients.",
        auto_continue: true,
        auto_pick_top1: true
      })
    })
  );
  const createBody = await json(createResponse);
  await runStep(
    new Request("http://localhost/api/agent/run-step", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        session_id: createBody.session_id,
        idempotency_key: "idem_route_runstep_004"
      })
    })
  );

  global.fetch = createAuthFetchMock({
    userId: AUTH_TEST_USER_ID,
    hasAuroraAccess: true,
    onboardingComplete: true,
    delegate: mockOpenAiFetch({ failChat: true })
  });
  const response = await chatRoute(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        session_id: createBody.session_id,
        message: "pick 1"
      })
    })
  );
  const body = await json(response);
  assert.equal(response.status, 200);
  assert.equal(body.assistant_source, "fallback");
  assert.equal(body.applied, true);

  const sessionResponse = await getSession(new Request("http://localhost", { headers: authJsonHeaders() }), {
    params: Promise.resolve({ sessionId: createBody.session_id })
  });
  const sessionBody = await json(sessionResponse);
  const fallbackAssistant = findAssistantMessageBySource(sessionBody.recent_messages, "fallback");
  assert.ok(fallbackAssistant);
});
