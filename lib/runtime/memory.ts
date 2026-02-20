import { env } from "../env";
import type { SessionRecord } from "../agent/types";
import { sha256 } from "../utils/hash";
import type { StorageRepository } from "../storage/types";
import type { RuntimeActionRecord, RuntimeEvalRecord, RuntimeMemoryRecord } from "./types";

export function buildBrandKey(session: SessionRecord): string {
  return sha256(`${session.product}::${session.audience}`);
}

export async function collectRuntimeMemory(input: {
  storage: StorageRepository;
  session: SessionRecord;
}): Promise<{ brandKey: string; memories: RuntimeMemoryRecord[] }> {
  const brandKey = buildBrandKey(input.session);
  const sessionMemories = await input.storage.listRuntimeMemories({
    scope: "session",
    session_id: input.session.id
  });
  if (!env.RUNTIME_MEMORY_PERSIST) {
    return {
      brandKey,
      memories: sessionMemories
    };
  }

  const brandMemories = await input.storage.listRuntimeMemories({
    scope: "brand",
    brand_key: brandKey
  });

  return {
    brandKey,
    memories: [...sessionMemories, ...brandMemories]
  };
}

export async function writeRuntimeMemory(input: {
  storage: StorageRepository;
  session: SessionRecord;
  action: RuntimeActionRecord;
  evaluation: RuntimeEvalRecord;
}): Promise<void> {
  const brandKey = buildBrandKey(input.session);

  await input.storage.upsertRuntimeMemory({
    scope: "session",
    session_id: input.session.id,
    brand_key: null,
    memory_key: "last_action",
    memory_value: {
      action_type: input.action.action_type,
      tool_name: input.action.tool_name,
      status: input.action.status
    },
    weight: 1,
    source_action_id: input.action.id
  });

  await input.storage.upsertRuntimeMemory({
    scope: "session",
    session_id: input.session.id,
    brand_key: null,
    memory_key: "last_eval",
    memory_value: {
      pass: input.evaluation.pass,
      scores: input.evaluation.scores,
      next_hint: input.evaluation.next_hint
    },
    weight: input.evaluation.pass ? 1 : 0.5,
    source_action_id: input.action.id
  });

  if (input.session.selected_candidate_id) {
    await input.storage.upsertRuntimeMemory({
      scope: "session",
      session_id: input.session.id,
      brand_key: null,
      memory_key: "selected_candidate",
      memory_value: {
        selected_candidate_id: input.session.selected_candidate_id
      },
      weight: 1,
      source_action_id: input.action.id
    });

    if (env.RUNTIME_MEMORY_PERSIST) {
      await input.storage.upsertRuntimeMemory({
        scope: "brand",
        session_id: null,
        brand_key: brandKey,
        memory_key: "preferred_candidate",
        memory_value: {
          selected_candidate_id: input.session.selected_candidate_id,
          style_keywords: input.session.style_keywords
        },
        weight: input.evaluation.pass ? 1 : 0.6,
        source_action_id: input.action.id
      });
    }
  }
}
