import { NextResponse } from 'next/server'

import { requireHost, hostAuthFail } from '@/lib/server/auth-host'
import { deleteOwnedSession } from '@/lib/server/host-sessions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// DELETE /api/host/sessions/[id] — a signed-in Sunday host deletes one of THEIR
// økter.
//   401 → not signed in (no Sunday session)
//   403 → signed in but not the owner (or not in HARVEST_ADMIN_EMAILS)
//   404 → session doesn't exist
//   200 → deleted (children cascade via FK on delete cascade)
//
// This is the ONLY session mutation behind Sunday Account auth. The code-based
// game RPCs (begin_works, resolve_vote, …) are unchanged and still gated by the
// device host_id. Anonymous play is unaffected.
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params

  let userId: string
  try {
    const user = await requireHost()
    userId = user.id
  } catch (err) {
    const res = hostAuthFail(err)
    if (res) return res
    console.error('[host:sessions:delete:auth]', err)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }

  try {
    const outcome = await deleteOwnedSession(id, userId)
    if (outcome === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (outcome === 'not_owner') return NextResponse.json({ error: 'not_owner' }, { status: 403 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[host:sessions:delete]', err)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }
}
