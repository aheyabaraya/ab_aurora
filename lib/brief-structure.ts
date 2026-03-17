const FIRST_DELIVERABLE_PREFIX = /^first deliverable\s*:/i;
const DESIGN_REQUIREMENT_PREFIX = /^design requirement\s*:/i;

export type StructuredBrief = {
  firstDeliverable: string | null;
  designRequirement: string | null;
  combined: string | null;
};

function normalizeLine(value: string): string {
  return value.trim();
}

export function parseStructuredBriefConstraint(constraint?: string | null): StructuredBrief {
  const normalized = typeof constraint === "string" ? constraint.trim() : "";
  if (!normalized) {
    return {
      firstDeliverable: null,
      designRequirement: null,
      combined: null
    };
  }

  let firstDeliverable: string | null = null;
  const designLines: string[] = [];

  for (const rawLine of normalized.split(/\n+/)) {
    const line = normalizeLine(rawLine);
    if (!line) {
      continue;
    }

    if (!firstDeliverable && FIRST_DELIVERABLE_PREFIX.test(line)) {
      const parsed = line.replace(FIRST_DELIVERABLE_PREFIX, "").trim();
      firstDeliverable = parsed.length > 0 ? parsed : null;
      continue;
    }

    if (DESIGN_REQUIREMENT_PREFIX.test(line)) {
      const parsed = line.replace(DESIGN_REQUIREMENT_PREFIX, "").trim();
      if (parsed.length > 0) {
        designLines.push(parsed);
      }
      continue;
    }

    designLines.push(line);
  }

  return {
    firstDeliverable,
    designRequirement: designLines.join("\n").trim() || null,
    combined: normalized
  };
}

export function composeStructuredBriefConstraint(input: {
  firstDeliverable?: string | null;
  designRequirement?: string | null;
}): string {
  const firstDeliverable = input.firstDeliverable?.trim() ?? "";
  const designRequirement = input.designRequirement?.trim() ?? "";
  const lines: string[] = [];

  if (firstDeliverable.length > 0) {
    lines.push(`First deliverable: ${firstDeliverable}`);
  }

  if (designRequirement.length > 0) {
    lines.push(`Design requirement: ${designRequirement}`);
  }

  return lines.join("\n").trim();
}
