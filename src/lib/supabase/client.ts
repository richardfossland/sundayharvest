import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Supabase client (anon key), scoped to the dedicated `harvest` schema
 * so SundayHarvest can coexist with the other SundaySuite apps in the same
 * shared Supabase project (free-tier 2-project limit) without table clashes.
 *
 * Every `.from('sessions')` / `.rpc('get_my_role')` therefore resolves to
 * `harvest.sessions` / `harvest.get_my_role`. The game is session-scoped with
 * no user auth: public tables use open RLS, while ALL secrets live in locked
 * tables reachable only through SECURITY DEFINER RPCs keyed on a per-player
 * secret (see supabase/migrations).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'harvest' },
    }
  )
}
