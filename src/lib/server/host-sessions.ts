import 'server-only'

// Owner-scoped session queries for the Sunday Account host dashboard ("Mine
// økter"). The owner is `harvest.sessions.host_user_id` — nullable, so anonymous
// (code-only) games keep working with it left null. Only games created while a
// host was signed in get stamped (via the create_owned_session RPC).

import { createDataClient } from '@/lib/supabase/data-server'
import type { Phase } from '@/types/game'

export interface OwnedSessionSummary {
  id: string
  code: string
  phase: Phase
  playerCount: number
  createdAt: string
}

type SessionRow = {
  id: string
  code: string
  phase: Phase
  player_count: number
  created_at: string
}

function toSummary(row: SessionRow): OwnedSessionSummary {
  return {
    id: row.id,
    code: row.code,
    phase: row.phase,
    playerCount: row.player_count,
    createdAt: row.created_at,
  }
}

/** All sessions owned by this Sunday user, newest first. SELECT is open RLS, so
 * the anon-key data client suffices; the owner filter is applied server-side. */
export async function listSessionsByOwner(
  userId: string
): Promise<OwnedSessionSummary[]> {
  const { data, error } = await createDataClient()
    .from('sessions')
    .select('id,code,phase,player_count,created_at')
    .eq('host_user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data as SessionRow[]) ?? []).map(toSummary)
}

/** Create a session owned by this Sunday user (best-effort owner stamp happens
 * inside the create_owned_session RPC). Returns the new session id + code. */
export async function createOwnedSession(
  hostId: string,
  userId: string
): Promise<{ id: string; code: string }> {
  const { data, error } = await createDataClient().rpc('create_owned_session', {
    p_host_id: hostId,
    p_host_user_id: userId,
  })
  if (error) throw new Error(error.message)
  if (!data?.ok) throw new Error(data?.error ?? 'create_failed')
  return { id: data.id as string, code: data.code as string }
}

export type DeleteOutcome = 'deleted' | 'not_found' | 'not_owner'

/** Delete a session this user owns, via the owner-gated SECURITY DEFINER RPC.
 * Children (players, secrets, roles, votes, work_plays, events) cascade via the
 * FK `on delete cascade`. The RPC refuses anonymous (owner-null) and other
 * hosts' games, which the caller maps to 403/404. */
export async function deleteOwnedSession(
  sessionId: string,
  userId: string
): Promise<DeleteOutcome> {
  const { data, error } = await createDataClient().rpc('delete_owned_session', {
    p_session_id: sessionId,
    p_host_user_id: userId,
  })
  if (error) throw new Error(error.message)
  if (data?.deleted) return 'deleted'
  return data?.reason === 'not_found' ? 'not_found' : 'not_owner'
}
