import { NextResponse } from 'next/server'

import { requireHost, hostAuthFail } from '@/lib/server/auth-host'
import { createOwnedSession } from '@/lib/server/host-sessions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/host/sessions — a SIGNED-IN Sunday host creates an økt that is tied
// to their account (so it shows up in "Øktene mine"). The owner stamp happens
// server-side via the create_owned_session RPC.
//
//   401 → not signed in
//   403 → signed in but not in HARVEST_ADMIN_EMAILS
//   200 → { id, code }
//
// Anonymous create (the landing's "Opprett spill", which calls create_session
// with no owner) is a SEPARATE path and is left untouched — this route is purely
// additive for the signed-in dashboard.
export async function POST(request: Request) {
  let userId: string
  try {
    const user = await requireHost()
    userId = user.id
  } catch (err) {
    const res = hostAuthFail(err)
    if (res) return res
    console.error('[host:sessions:create:auth]', err)
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }

  try {
    let hostId = ''
    try {
      const body = (await request.json()) as { hostId?: string }
      hostId = (body?.hostId ?? '').toString().trim()
    } catch {
      // empty/invalid body — fall through to the generated host id below
    }
    // Best-effort: the per-game console authenticates with the device host_id.
    // If the client didn't send one, mint a stable server-side fallback.
    if (!hostId) hostId = `host_${crypto.randomUUID()}`

    const { id, code } = await createOwnedSession(hostId, userId)
    return NextResponse.json({ id, code })
  } catch (err) {
    console.error('[host:sessions:create]', err)
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }
}
