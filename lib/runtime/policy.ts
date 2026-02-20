import { env } from "../env";
import type { SessionRecord } from "../agent/types";
import type { RuntimeActionSpec, RuntimePolicyResult } from "./types";

function isHighCostAction(action: RuntimeActionSpec): boolean {
  return action.tool_name.includes("mint") || action.action_type.includes("mint");
}

function requiresJobSlot(action: RuntimeActionSpec): boolean {
  return action.tool_name.startsWith("tool.brand.ensure_");
}

export function evaluateRuntimePolicy(input: {
  session: SessionRecord;
  action: RuntimeActionSpec;
  activeJobs: number;
}): RuntimePolicyResult {
  if (isHighCostAction(input.action)) {
    return {
      decision: "confirm_required",
      reason: "High-cost action requires explicit confirmation."
    };
  }

  if (requiresJobSlot(input.action) && input.activeJobs >= env.CONCURRENT_JOB_LIMIT) {
    return {
      decision: "deny",
      reason: "Another active job exists for this session."
    };
  }

  return {
    decision: "allow",
    reason: "Policy check passed."
  };
}
