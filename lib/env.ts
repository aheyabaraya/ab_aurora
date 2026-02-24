import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const stringBoolean = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    AGENT_UI_MODE: z.enum(["chat_flat", "agent_stage"]).default("agent_stage"),
    AUTO_CONTINUE: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
    AUTO_PICK_TOP1: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
    API_TOKEN_REQUIRED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    SECURITY_HEADERS_STRICT: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    ENABLE_AGENT_CHAT_CONTROL: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    ENABLE_DEV_SEED_API: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    DEV_SEED_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    RUNTIME_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    RUNTIME_MAX_ITERATIONS: z.coerce.number().int().min(1).max(100).default(12),
    RUNTIME_REPLAN_LIMIT: z.coerce.number().int().min(0).max(10).default(2),
    RUNTIME_TOOL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
    RUNTIME_MEMORY_PERSIST: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    RUNTIME_EVAL_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.8),
    OPENAI_FALLBACK_MODE: z.enum(["deterministic_mock", "none"]).default("deterministic_mock"),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("http://127.0.0.1:54321"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).default("dev-anon-key"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default("dev-service-role-key"),
    API_BEARER_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    OPENAI_MODEL_TEXT: z.string().default("gpt-4o"),
    OPENAI_MODEL_IMAGE: z.string().default("gpt-image-1"),
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
