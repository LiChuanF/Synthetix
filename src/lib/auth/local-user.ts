import { db } from "@/lib/db";
import { LOCAL_USER } from "./local-user-info";
import type { AuthUser } from "@/types/auth";

/**
 * The application currently runs as a single fixed local user. Authentication
 * is disabled at the edge (see src/proxy.ts) and every server request is
 * attributed to this account. The auth code paths are kept intact so the
 * login / user-management modules can be re-enabled later.
 */
export { LOCAL_USER } from "./local-user-info";

function toAuthUser(user: {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: string;
}): AuthUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role === "user" ? "user" : "admin",
  };
}

/**
 * Idempotently create the fixed local user row. Called at startup and before
 * any request that needs the user, so the database is usable after a reset
 * without running the setup flow.
 */
export async function ensureLocalUser(): Promise<AuthUser> {
  const existing = await db.user.findUnique({
    where: { username: LOCAL_USER.username },
  });
  if (existing) {
    return toAuthUser(existing);
  }

  try {
    const created = await db.user.create({
      data: {
        id: LOCAL_USER.id,
        username: LOCAL_USER.username,
        displayName: LOCAL_USER.displayName,
        role: LOCAL_USER.role,
        passwordHash: "",
        isFirstLogin: false,
      },
    });
    return toAuthUser(created);
  } catch {
    // A concurrent startup/request may have created the row first.
    const raced = await db.user.findUnique({
      where: { username: LOCAL_USER.username },
    });
    if (!raced) throw new Error("Failed to create the local user");
    return toAuthUser(raced);
  }
}
