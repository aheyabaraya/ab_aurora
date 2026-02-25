process.env.NODE_ENV = "test";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

test("File storage seed contract persists seeded sessions across repository instances", async () => {
  const originalCwd = process.cwd();
  const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "ab-aurora-file-seed-"));

  process.chdir(tempCwd);
  try {
    const { FileStorageRepository } = require("../../.tmp-tests/lib/storage/file.js");
    const { buildSessionSeed } = require("../../.tmp-tests/lib/testing/session-seed.js");
    const { runAgentPipeline } = require("../../.tmp-tests/lib/agent/orchestrator.js");

    let storage = new FileStorageRepository();
    const seeded = await buildSessionSeed({
      storage,
      preset: "top3_ready",
      auto_continue: false
    });

    const firstRead = await storage.getSession(seeded.session_id);
    assert.ok(firstRead);
    assert.equal(firstRead.current_step, "top3_select");

    storage = new FileStorageRepository();
    const reloaded = await storage.getSession(seeded.session_id);
    assert.ok(reloaded);
    assert.equal(reloaded.current_step, "top3_select");

    const artifacts = await storage.listArtifactsBySession(seeded.session_id);
    const kinds = artifacts.map((artifact) => artifact.kind);
    assert.equal(kinds.includes("candidates_top3"), true);

    const progressed = await runAgentPipeline({
      storage,
      request: {
        session_id: seeded.session_id,
        idempotency_key: "idem_file_seed_contract_001"
      }
    });
    assert.equal(progressed.current_step, "approve_build");
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempCwd, { recursive: true, force: true });
  }
});

test("File storage falls back to tmp runtime dir when configured data dir is unavailable", async () => {
  const originalDataDir = process.env.AB_AURORA_DATA_DIR;
  const fileModulePath = "../../.tmp-tests/lib/storage/file.js";

  try {
    process.env.AB_AURORA_DATA_DIR = "/var/task/.data";
    delete require.cache[require.resolve(fileModulePath)];

    const { FileStorageRepository } = require(fileModulePath);
    const storage = new FileStorageRepository();
    const created = await storage.createSession({
      mode: "mode_b",
      product: "Fallback storage check",
      audience: "Ops",
      style_keywords: ["calm"],
      auto_continue: false,
      auto_pick_top1: false
    });

    assert.ok(created.id.startsWith("sess_"));
  } finally {
    if (originalDataDir === undefined) {
      delete process.env.AB_AURORA_DATA_DIR;
    } else {
      process.env.AB_AURORA_DATA_DIR = originalDataDir;
    }
    delete require.cache[require.resolve(fileModulePath)];
  }
});
