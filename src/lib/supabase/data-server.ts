import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side DATA client for the `harvest` game project (NOT the Sunday Account
 * issuer project — that's `auth-server.ts`).
 *
 * It is used by the host dashboard to list the signed-in host's own sessions and
 * to call the owner-gated `delete_owned_session` RPC. It is SESSION-LESS so it
 * never touches the SSO `sb-*` cookie.
 *
 * Auth model: the `harvest` schema keeps SELECT open on `sessions` (RLS
 * `using(true)`) and exposes `delete_owned_session`/`create_owned_session` as
 * SECURITY DEFINER RPCs granted to `anon`, so the anon key is sufficient. If a
 * service-role key is ever set (SUPABASE_SERVICE_ROLE_KEY), it is preferred for
 * defence in depth, but it is OPTIONAL — the app ships with no runtime secret.
 */
export function createDataClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createSupabaseClient(url, key, {
    db: { schema: 'harvest' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
