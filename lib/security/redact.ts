const SECRET_KEYWORDS = [
  "token",
  "secret",
  "password",
  "authorization",
  "api_key",
  "apikey",
  "bearer",
  "cookie",
  "private_key",
  "service_role"
];

function shouldRedactKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SECRET_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function redactAny(value: unknown): unknown {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactAny);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
      if (shouldRedactKey(key)) {
        return [key, "***"] as const;
      }
      return [key, redactAny(nestedValue)] as const;
    });
    return Object.fromEntries(entries);
  }
  return value;
}

export function redactForLogs(input: Record<string, unknown>): Record<string, unknown> {
  return redactAny(input) as Record<string, unknown>;
}
