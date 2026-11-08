import { cookies } from "next/headers";
import { verifyToken, signAccessToken, signRefreshToken } from "./jwt";
import { ACCESS_MAX_AGE, REFRESH_MAX_AGE } from "./token-core";
import { ensureLocalUser } from "./local-user";
import { useSecureCookies } from "./cookie-security";
import type { AuthUser, JWTPayload } from "@/types/auth";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

export async function setAuthCookies(
  response: Response,
  accessToken: string,
  refreshToken: string
): Promise<void> {
  const secure = useSecureCookies() ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${ACCESS_TOKEN_KEY}=${accessToken}; Max-Age=${ACCESS_MAX_AGE}; Path=/; HttpOnly; SameSite=Strict${secure}`
  );
  response.headers.append(
    "Set-Cookie",
    `${REFRESH_TOKEN_KEY}=${refreshToken}; Max-Age=${REFRESH_MAX_AGE}; Path=/; HttpOnly; SameSite=Strict${secure}`
  );
}

export function clearAuthCookies(response: Response): void {
  const secure = useSecureCookies() ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${ACCESS_TOKEN_KEY}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secure}`
  );
  response.headers.append(
    "Set-Cookie",
    `${REFRESH_TOKEN_KEY}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secure}`
  );
}

async function getRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_TOKEN_KEY)?.value ?? null;
}

/**
 * Authentication is temporarily disabled: every request runs as the fixed
 * local user. To re-enable login, restore the cookie/JWT and API-key lookup
 * that used to live here (and the gate in src/proxy.ts).
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  return ensureLocalUser();
}

export async function refreshSession(): Promise<{
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
} | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  try {
    const payload = await verifyToken(refreshToken, "refresh");
    const user = payloadToAuthUser(payload);
    const jwtPayload: Omit<JWTPayload, "kind"> = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };
    const [newAccessToken, newRefreshToken] = await Promise.all([
      signAccessToken(jwtPayload),
      signRefreshToken(jwtPayload),
    ]);
    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user,
    };
  } catch {
    return null;
  }
}

function payloadToAuthUser(payload: JWTPayload): AuthUser {
  return {
    id: payload.userId,
    username: payload.username,
    email: null,
    displayName: "",
    role: payload.role,
  };
}
