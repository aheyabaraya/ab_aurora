import { env } from "../env";

export type SupabaseAuthUser = {
  id: string;
  is_anonymous: boolean;
};

function extractBearerToken(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (!authorization) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) {
    return null;
  }
  const token = match[1]?.trim();
  return token && token.length > 0 ? token : null;
}

function buildSupabaseAuthUserUrl(): string {
  return `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/user`;
}

export async function getSupabaseUserFromAccessToken(accessToken: string): Promise<SupabaseAuthUser | null> {
  try {
    const response = await fetch(buildSupabaseAuthUserUrl(), {
      method: "GET",
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.id !== "string" || body.id.length === 0) {
      return null;
    }

    return {
      id: body.id,
      is_anonymous: Boolean(body.is_anonymous)
    };
  } catch {
    return null;
  }
}

export async function getSupabaseUserFromRequest(request: Request): Promise<SupabaseAuthUser | null> {
  const token = extractBearerToken(new Headers(request.headers));
  if (!token) {
    return null;
  }
  return getSupabaseUserFromAccessToken(token);
}
