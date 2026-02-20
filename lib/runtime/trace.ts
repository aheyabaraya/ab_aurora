import type { StorageRepository } from "../storage/types";
import type { RuntimeEventRecord } from "./types";

export async function recordRuntimeEvent(input: {
  storage: StorageRepository;
  session_id: string;
  goal_id: string;
  event_type: RuntimeEventRecord["event_type"];
  payload: Record<string, unknown>;
}): Promise<void> {
  await input.storage.createRuntimeEvent({
    session_id: input.session_id,
    goal_id: input.goal_id,
    event_type: input.event_type,
    payload: input.payload
  });
}
