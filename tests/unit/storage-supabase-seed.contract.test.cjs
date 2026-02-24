process.env.NODE_ENV = process.env.NODE_ENV || "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const hasSupabaseEnv =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("replace-with") &&
  typeof process.env.SUPABASE_SERVICE_ROLE_KEY === "string" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY.length > 0 &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY.includes("replace-with") &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY.startsWith("dev-");

const shouldRun = process.env.SEED_TEST_SUPABASE === "true" && hasSupabaseEnv;
const contractTest = shouldRun ? test : test.skip;

contractTest("Supabase seed contract supports seed -> chat/revise/run-step style roundtrip", async () => {
  const { SupabaseStorageRepository } = require("../../.tmp-tests/lib/storage/supabase.js");
  const { buildSessionSeed } = require("../../.tmp-tests/lib/testing/session-seed.js");
  const { runAgentPipeline } = require("../../.tmp-tests/lib/agent/orchestrator.js");

  const storage = new SupabaseStorageRepository();
  const seeded = await buildSessionSeed({
    storage,
    preset: "top3_ready",
    auto_continue: false
  });

  const picked = await runAgentPipeline({
    storage,
    request: {
      session_id: seeded.session_id,
      action: "select_candidate",
      payload: {
        candidate_id: "cand_1"
      },
      idempotency_key: "idem_supabase_seed_contract_001"
    }
  });
  assert.equal(picked.current_step, "approve_build");

  const build = await runAgentPipeline({
    storage,
    request: {
      session_id: seeded.session_id,
      action: "proceed",
      idempotency_key: "idem_supabase_seed_contract_002"
    }
  });
  assert.ok(["package", "done"].includes(build.current_step));

  const revised = await runAgentPipeline({
    storage,
    request: {
      session_id: seeded.session_id,
      action: "revise_constraint",
      payload: {
        constraint: "reduce futuristic and keep editorial calm tone",
        intensity: 60
      },
      idempotency_key: "idem_supabase_seed_contract_003"
    }
  });
  assert.ok(["candidates_generate", "top3_select", "approve_build"].includes(revised.current_step));

  const rerun = await runAgentPipeline({
    storage,
    request: {
      session_id: seeded.session_id,
      idempotency_key: "idem_supabase_seed_contract_004"
    }
  });
  assert.ok(["top3_select", "approve_build"].includes(rerun.current_step));
});
