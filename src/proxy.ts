import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Authentication gate disabled while the app runs as a fixed local user.
 *
 * To re-enable login, restore the JWT cookie / Bearer-token gate that used to
 * live here (git history has the full implementation) together with the
 * session lookup in src/lib/auth/session.ts.
 */
export async function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
