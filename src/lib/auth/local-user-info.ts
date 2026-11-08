import type { UserRole } from "@/types/auth";

/** Client-safe identity of the fixed local user (no database imports). */
export const LOCAL_USER = {
  id: "local-user",
  username: "local",
  displayName: "Local User",
  role: "admin" as UserRole,
};
