/**
 * Is the OPTIONAL Sunday Account host login configured?
 *
 * Host SSO is off by design until both issuer variables are set (see
 * `.env.local.example`). When it is off, the host-login surface (`/host`,
 * `/host/login`, `/auth/callback`) must say so instead of crashing: creating a
 * Supabase client without a URL/key throws, which used to turn those routes
 * into 500s. Anonymous, code-based hosting (`/host/<id>`) is unaffected.
 *
 * The two `process.env.NEXT_PUBLIC_*` reads are written out in full so Next
 * inlines them in client bundles too.
 */
export function hostLoginEnabled(
  url: string | undefined = process.env.NEXT_PUBLIC_SUNDAY_AUTH_URL,
  anonKey: string | undefined = process.env.NEXT_PUBLIC_SUNDAY_AUTH_ANON_KEY
): boolean {
  return Boolean(url?.trim() && anonKey?.trim())
}
