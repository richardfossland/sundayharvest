import { redirect } from 'next/navigation'

import { getHostUser } from '@/lib/server/auth-host'
import { listSessionsByOwner } from '@/lib/server/host-sessions'
import { HostDashboard } from './HostDashboard'

// Signed-in host dashboard ("Øktene mine"). Middleware already redirects
// logged-OUT users to /host/login; this re-checks server-side (defense in depth)
// and loads the host's own sessions. Anonymous hosting is unaffected — this
// surface is purely additive (the per-game console at /host/<id> stays
// code-based, gated by the device host_id).
export const dynamic = 'force-dynamic'

export default async function HostDashboardPage() {
  const user = await getHostUser()
  if (!user) redirect('/host/login')

  const sessions = await listSessionsByOwner(user.id)
  return <HostDashboard email={user.email ?? ''} sessions={sessions} />
}
