import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  refreshToken: null as string | null,
  verifyToken: vi.fn(),
  ensureLocalUser: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      key === "refresh_token" && state.refreshToken ? { value: state.refreshToken } : undefined,
  }),
}));

vi.mock("@/lib/auth/jwt", () => ({
  verifyToken: state.verifyToken,
  signAccessToken: vi.fn(async () => "new-access"),
  signRefreshToken: vi.fn(async () => "new-refresh"),
}));

vi.mock("@/lib/auth/local-user", () => ({
  ensureLocalUser: state.ensureLocalUser,
  LOCAL_USER: {
    id: "local-user",
    username: "local",
    displayName: "Local User",
    role: "admin",
  },
}));

import { getAuthUser, refreshSession } from "@/lib/auth/session";

const LOCAL_USER = {
  id: "local-user",
  username: "local",
  email: null,
  displayName: "Local User",
  role: "admin" as const,
};

describe("fixed local user session", () => {
  beforeEach(() => {
    state.refreshToken = null;
    state.verifyToken.mockReset();
    state.ensureLocalUser.mockReset();
  });

  it("authenticates every request as the fixed local user", async () => {
    state.ensureLocalUser.mockResolvedValue(LOCAL_USER);

    await expect(getAuthUser()).resolves.toEqual(LOCAL_USER);
    expect(state.ensureLocalUser).toHaveBeenCalledTimes(1);
  });

  it("does not consult tokens or API keys for ordinary requests", async () => {
    state.refreshToken = "refresh";
    state.ensureLocalUser.mockResolvedValue(LOCAL_USER);

    await expect(getAuthUser()).resolves.toEqual(LOCAL_USER);
    expect(state.verifyToken).not.toHaveBeenCalled();
  });

  it("uses the refresh token only through the future-facing refresh boundary", async () => {
    state.refreshToken = "refresh";
    state.verifyToken.mockResolvedValue({
      userId: "user-1",
      username: "admin",
      role: "admin",
      kind: "refresh",
    });

    await expect(refreshSession()).resolves.toMatchObject({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      user: { id: "user-1" },
    });
    expect(state.verifyToken).toHaveBeenCalledWith("refresh", "refresh");
  });

  it("returns null from the refresh boundary without a refresh token", async () => {
    await expect(refreshSession()).resolves.toBeNull();
    expect(state.verifyToken).not.toHaveBeenCalled();
  });
});
