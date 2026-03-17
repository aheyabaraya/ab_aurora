import { env } from "../env";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations";
const DEFAULT_TIMEOUT_MS = 12000;

export type OpenAiHealthProbeResult = {
  ok: boolean;
  latency_ms: number;
  error_reason?: string;
};

export type OpenAiHealthCheckResult = {
  ok: boolean;
  checked_at: string;
  model: {
    text: string;
    image: string;
  };
  latency_ms: number;
  text: OpenAiHealthProbeResult;
  image: OpenAiHealthProbeResult;
  error_reason?: string;
};

function nowMs(): number {
  return Date.now();
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const maybeError = error as { name?: string; message?: string };
  if (maybeError.name === "AbortError") {
    return true;
  }
  if (typeof maybeError.message === "string" && maybeError.message.toLowerCase().includes("abort")) {
    return true;
  }
  return false;
}

function probeErrorReasonFromThrown(error: unknown): string {
  if (isAbortError(error)) {
    return "timeout";
  }
  return "network_error";
}

async function fetchWithTimeout(input: {
  url: string;
  timeoutMs: number;
  body: Record<string, unknown>;
  fetchImpl: typeof fetch;
}): Promise<{ response: Response; latencyMs: number }> {
  const started = nowMs();
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, input.timeoutMs);

  try {
    const response = await input.fetchImpl(input.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(input.body),
      signal: abortController.signal,
      cache: "no-store"
    });
    return {
      response,
      latencyMs: nowMs() - started
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeText(input: {
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<OpenAiHealthProbeResult> {
  try {
    const result = await fetchWithTimeout({
      url: OPENAI_CHAT_URL,
      timeoutMs: input.timeoutMs,
      fetchImpl: input.fetchImpl,
      body: {
        model: env.OPENAI_MODEL_TEXT,
        temperature: 0,
        max_tokens: 16,
        messages: [
          {
            role: "system",
            content: "Respond with one short token: ok"
          },
          {
            role: "user",
            content: "health check"
          }
        ]
      }
    });

    if (!result.response.ok) {
      return {
        ok: false,
        latency_ms: result.latencyMs,
        error_reason: `http_${result.response.status}`
      };
    }

    const payload = (await result.response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      return {
        ok: false,
        latency_ms: result.latencyMs,
        error_reason: "invalid_payload"
      };
    }

    return {
      ok: true,
      latency_ms: result.latencyMs
    };
  } catch (error) {
    return {
      ok: false,
      latency_ms: input.timeoutMs,
      error_reason: probeErrorReasonFromThrown(error)
    };
  }
}

async function probeImage(input: {
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<OpenAiHealthProbeResult> {
  try {
    const imageRequestBody = {
      model: env.OPENAI_MODEL_IMAGE,
      prompt: "AB Aurora health check image; minimal abstract gradient.",
      size: "1024x1024",
      n: 1
    };

    const result = await fetchWithTimeout({
      url: OPENAI_IMAGE_URL,
      timeoutMs: input.timeoutMs,
      fetchImpl: input.fetchImpl,
      body: imageRequestBody
    });

    if (!result.response.ok) {
      return {
        ok: false,
        latency_ms: result.latencyMs,
        error_reason: `http_${result.response.status}`
      };
    }

    const payload = (await result.response.json()) as {
      data?: Array<{
        url?: string;
        b64_json?: string;
      }>;
    };
    const first = payload.data?.[0];
    const hasUrl = typeof first?.url === "string" && first.url.length > 0;
    const hasB64 = typeof first?.b64_json === "string" && first.b64_json.length > 0;
    if (!hasUrl && !hasB64) {
      return {
        ok: false,
        latency_ms: result.latencyMs,
        error_reason: "invalid_payload"
      };
    }

    return {
      ok: true,
      latency_ms: result.latencyMs
    };
  } catch (error) {
    return {
      ok: false,
      latency_ms: input.timeoutMs,
      error_reason: probeErrorReasonFromThrown(error)
    };
  }
}

export async function runOpenAiHealthCheck(input?: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  nowIso?: () => string;
}): Promise<OpenAiHealthCheckResult> {
  const timeoutMs = input?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = input?.fetchImpl ?? fetch;
  const nowIso = input?.nowIso ?? (() => new Date().toISOString());
  const started = nowMs();
  const checkedAt = nowIso();

  const model = {
    text: env.OPENAI_MODEL_TEXT,
    image: env.OPENAI_MODEL_IMAGE
  };

  if (!env.OPENAI_API_KEY) {
    return {
      ok: false,
      checked_at: checkedAt,
      model,
      latency_ms: 0,
      text: {
        ok: false,
        latency_ms: 0,
        error_reason: "missing_api_key"
      },
      image: {
        ok: false,
        latency_ms: 0,
        error_reason: "missing_api_key"
      },
      error_reason: "missing_api_key"
    };
  }

  const text = await probeText({
    fetchImpl,
    timeoutMs
  });
  const image = await probeImage({
    fetchImpl,
    timeoutMs
  });
  const ok = text.ok && image.ok;
  const errorReason = !text.ok ? `text:${text.error_reason ?? "unknown"}` : !image.ok ? `image:${image.error_reason ?? "unknown"}` : undefined;

  return {
    ok,
    checked_at: checkedAt,
    model,
    latency_ms: nowMs() - started,
    text,
    image,
    ...(errorReason ? { error_reason: errorReason } : {})
  };
}
