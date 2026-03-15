import { z } from "zod";

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized;
}

const emptyToUndefined = (value: unknown) => normalizeString(value);

function normalizeBooleanLiteral(value: unknown): unknown {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }

  let candidate = normalized;
  if (
    (candidate.startsWith('"') && candidate.endsWith('"')) ||
    (candidate.startsWith("'") && candidate.endsWith("'"))
  ) {
    candidate = candidate.slice(1, -1).trim();
  } else {
    if (candidate.startsWith('"') || candidate.startsWith("'")) {
      candidate = candidate.slice(1).trim();
    }
    if (candidate.endsWith('"') || candidate.endsWith("'")) {
      candidate = candidate.slice(0, -1).trim();
    }
  }

  return candidate.toLowerCase();
}

function envBoolean(defaultValue: "true" | "false") {
  return z
    .preprocess(normalizeBooleanLiteral, z.enum(["true", "false"]).default(defaultValue))
    .transform((value) => value === "true");
}

function normalizeSupabaseUrl(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }

  const lower = normalized.toLowerCase();
  if (
    lower.includes("replace-with") ||
    lower.includes("your-project-ref") ||
    lower === "placeholder" ||
    lower === "none"
  ) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

const stringBoolean = envBoolean("false");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    AGENT_UI_MODE: z.enum(["chat_flat", "agent_stage"]).default("agent_stage"),
    AUTO_CONTINUE: envBoolean("true"),
    AUTO_PICK_TOP1: envBoolean("true"),
    AUTH_V2_ENABLED: envBoolean("true"),
    API_TOKEN_REQUIRED: envBoolean("false"),
    ALLOW_FILE_STORAGE_IN_PRODUCTION: envBoolean("false"),
    SECURITY_HEADERS_STRICT: envBoolean("true"),
    ENABLE_AGENT_CHAT_CONTROL: envBoolean("true"),
    ENABLE_DEV_SEED_API: envBoolean("false"),
    DEV_SEED_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    RUNTIME_ENABLED: envBoolean("false"),
    RUNTIME_MAX_ITERATIONS: z.coerce.number().int().min(1).max(100).default(12),
    RUNTIME_REPLAN_LIMIT: z.coerce.number().int().min(0).max(10).default(2),
    RUNTIME_TOOL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
    RUNTIME_MEMORY_PERSIST: envBoolean("true"),
    RUNTIME_EVAL_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.8),
    OPENAI_FALLBACK_MODE: z.enum(["deterministic_mock", "none"]).default("deterministic_mock"),
    NEXT_PUBLIC_SUPABASE_URL: z
      .preprocess(normalizeSupabaseUrl, z.union([z.string().url(), z.undefined()]))
      .transform((value) => value ?? "http://127.0.0.1:54321"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z
      .preprocess(emptyToUndefined, z.union([z.string().min(1), z.undefined()]))
      .transform((value) => value ?? "dev-anon-key"),
    SUPABASE_SERVICE_ROLE_KEY: z
      .preprocess(emptyToUndefined, z.union([z.string().min(1), z.undefined()]))
      .transform((value) => value ?? "dev-service-role-key"),
    API_BEARER_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    ONBOARDING_CODE_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(300),
    ONBOARDING_STATE_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(600),
    MOCK_ISSUER_ENABLED: envBoolean("true"),
    MOCK_ISSUER_NAME: z.string().min(1).max(120).default("ab_aurora_mock"),
    ONBOARDING_BYPASS_ENABLED: envBoolean("false"),
    NEXT_PUBLIC_ONBOARDING_BYPASS_ENABLED: envBoolean("false"),
    OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    OPENAI_MODEL_TEXT: z.string().default("gpt-4o"),
    OPENAI_MODEL_IMAGE: z.string().default("gpt-image-1"),
    OPENAI_STRICT_SESSION_GUARD: envBoolean("false"),
    CHAT_OPENAI_LIMIT_PER_DAY: z.coerce.number().int().min(1).default(30),
    CHAT_OPENAI_MAX_TOKENS: z.coerce.number().int().min(64).max(1024).default(220),
    CHAT_OPENAI_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.2),
    INTENT_CLARIFY_THRESHOLD: z.coerce.number().int().min(1).max(5).default(4),
    CANDIDATE_COUNT: z.coerce.number().int().min(1).max(50).default(20),
    TOP_K: z.coerce.number().int().min(1).max(10).default(3),
    MAX_REVISIONS: z.coerce.number().int().min(0).max(10).default(2),
    MAX_SELF_HEAL_ATTEMPTS: z.coerce.number().int().min(0).max(10).default(3),
    ENABLE_MONAD_MINT: stringBoolean,
    MONAD_CHAIN_ID: z.coerce.number().int().positive().default(10143),
    MONAD_PUBLIC_RPC_URL: z.string().url().default("https://testnet-rpc.monad.xyz"),
    MONAD_EXPLORER_URL: z.string().url().default("https://testnet.monadexplorer.com"),
    MONAD_RPC_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
    MONAD_PRIVATE_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    REQUEST_LIMIT_PER_DAY: z.coerce.number().int().min(1).default(100),
    IMAGE_LIMIT_PER_DAY: z.coerce.number().int().min(0).default(20),
    CONCURRENT_JOB_LIMIT: z.coerce.number().int().min(1).default(1),
    SESSION_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
    STORAGE_BUCKET_PACKS: z.string().default("brand-packs"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
  })
  .superRefine((parsed, context) => {
    if (parsed.ENABLE_DEV_SEED_API && !parsed.DEV_SEED_TOKEN) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DEV_SEED_TOKEN is required when ENABLE_DEV_SEED_API=true",
        path: ["DEV_SEED_TOKEN"]
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, string | undefined>): AppEnv {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${issues}`);
  }
  return parsed.data;
}

export const env = parseEnv(process.env);
