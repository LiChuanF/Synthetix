/**
 * Whether auth cookies carry the Secure flag.
 *
 * `next start` sets NODE_ENV=production, which marks cookies Secure. Browsers
 * refuse Secure cookies on plain HTTP (localhost is the only exemption), so an
 * HTTP-only intranet deployment would accept the login POST but never store the
 * session — the user bounces straight back to /login. Set COOKIE_SECURE=false
 * on such deployments; leave it unset when TLS terminates in front of the app.
 */
export function useSecureCookies(): boolean {
  return process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
}
