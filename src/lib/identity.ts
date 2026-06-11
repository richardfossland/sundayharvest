// Per-device identity, held in localStorage. The `secret` is the security
// linchpin (PLAN-AMENDMENTS §A): it is returned ONCE by join_session and is
// required by every player-scoped RPC, so knowing another player's public UUID
// is not enough to read their role.

const K = {
  playerId: 'harvest_player_id',
  sessionId: 'harvest_session_id',
  secret: 'harvest_secret',
  hostId: 'harvest_host_id',
  hostSession: 'harvest_host_session',
}

export interface Identity {
  playerId: string | null
  sessionId: string | null
  secret: string | null
}

export function getIdentity(): Identity {
  if (typeof window === 'undefined') return { playerId: null, sessionId: null, secret: null }
  return {
    playerId: localStorage.getItem(K.playerId),
    sessionId: localStorage.getItem(K.sessionId),
    secret: localStorage.getItem(K.secret),
  }
}

export function setIdentity(playerId: string, sessionId: string, secret: string) {
  localStorage.setItem(K.playerId, playerId)
  localStorage.setItem(K.sessionId, sessionId)
  localStorage.setItem(K.secret, secret)
}

export function clearIdentity() {
  Object.values(K).forEach((k) => localStorage.removeItem(k))
}

export function getHostId(sessionId?: string): string | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(K.hostId)
  if (sessionId && localStorage.getItem(K.hostSession) !== sessionId) return stored // still usable; UI gates
  return stored
}

/** Create-or-reuse a stable host id for this device. */
export function ensureHostId(): string {
  let id = localStorage.getItem(K.hostId)
  if (!id) {
    id = 'host_' + crypto.randomUUID()
    localStorage.setItem(K.hostId, id)
  }
  return id
}

export function bindHostSession(sessionId: string) {
  localStorage.setItem(K.hostSession, sessionId)
}

/** Adopt a transferred host id (host hand-off). */
export function adoptHostId(hostId: string, sessionId: string) {
  localStorage.setItem(K.hostId, hostId)
  localStorage.setItem(K.hostSession, sessionId)
}
