import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Sunday Account host SSO: the ONE authz predicate + the owner-scoped queries +
// the DELETE route's 401/403/404/200 contract. The DATA client (issuer + game)
// and the auth client are mocked so this stays in the plain-Node test env like
// the AI-debrief tests.
// ---------------------------------------------------------------------------

import { adminEmailSet, isAdminEmail } from './auth-host'

describe('isAdminEmail (the ONE authz predicate, fail-closed)', () => {
  it('matches case-insensitively and trims', () => {
    expect(isAdminEmail('Host@Example.com', 'host@example.com')).toBe(true)
    expect(isAdminEmail('  host@example.com ', 'host@example.com')).toBe(true)
  })
  it('rejects non-listed emails', () => {
    expect(isAdminEmail('nope@example.com', 'host@example.com')).toBe(false)
  })
  it('fails closed on an empty allow-list (nobody is a host)', () => {
    expect(isAdminEmail('host@example.com', '')).toBe(false)
    expect(isAdminEmail('host@example.com', '   ')).toBe(false)
  })
  it('falls back to HARVEST_ADMIN_EMAILS env when the arg is omitted', () => {
    const prev = process.env.HARVEST_ADMIN_EMAILS
    process.env.HARVEST_ADMIN_EMAILS = 'host@example.com'
    expect(isAdminEmail('host@example.com')).toBe(true)
    expect(isAdminEmail('nope@example.com')).toBe(false)
    process.env.HARVEST_ADMIN_EMAILS = prev
  })
  it('rejects null/undefined email', () => {
    expect(isAdminEmail(null, 'host@example.com')).toBe(false)
    expect(isAdminEmail(undefined, 'host@example.com')).toBe(false)
  })
  it('parses comma / space / semicolon separated lists', () => {
    const set = adminEmailSet('a@x.com, b@x.com;c@x.com  d@x.com')
    expect(set).toEqual(new Set(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']))
    expect(isAdminEmail('c@x.com', 'a@x.com, b@x.com;c@x.com')).toBe(true)
  })
})

// ---- Mock the game DATA client (sessions table + owner-gated delete RPC) -----

type SessionRecord = {
  id: string
  code: string
  phase: string
  player_count: number
  created_at: string
  host_user_id: string | null
}

const state: { sessions: SessionRecord[] } = { sessions: [] }

vi.mock('@/lib/supabase/data-server', () => {
  function from() {
    return makeQuery()
  }
  function makeQuery() {
    const filters: { col: string; val: unknown }[] = []
    const q = {
      select() {
        return q
      },
      eq(col: string, val: unknown) {
        filters.push({ col, val })
        return q
      },
      order() {
        return q
      },
      match(rows: SessionRecord[]) {
        return rows.filter((r) =>
          filters.every((f) => (r as Record<string, unknown>)[f.col] === f.val)
        )
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        return resolve({ data: q.match(state.sessions), error: null })
      },
    }
    return q
  }

  // The owner-gated delete RPC mirrors harvest.delete_owned_session.
  async function rpc(name: string, args: Record<string, unknown>) {
    if (name === 'delete_owned_session') {
      const sid = args.p_session_id as string
      const owner = args.p_host_user_id as string
      const row = state.sessions.find((s) => s.id === sid)
      if (!row) {
        return { data: { ok: false, deleted: false, reason: 'not_found' }, error: null }
      }
      if (row.host_user_id === null || row.host_user_id !== owner) {
        return { data: { ok: false, deleted: false, reason: 'not_owner' }, error: null }
      }
      state.sessions = state.sessions.filter((s) => s.id !== sid)
      return { data: { ok: true, deleted: true }, error: null }
    }
    return { data: null, error: { message: 'unknown rpc' } }
  }

  return { createDataClient: () => ({ from, rpc }) }
})

// requireHost → drive its resolved/empty user via this mock auth client.
const authState: { user: { id: string; email: string } | null } = { user: null }
vi.mock('@/lib/supabase/auth-server', () => ({
  createAuthClient: async () => ({
    auth: { getUser: async () => ({ data: { user: authState.user } }) },
  }),
}))

import { deleteOwnedSession, listSessionsByOwner } from './host-sessions'
import { DELETE } from '@/app/api/host/sessions/[id]/route'

const ME = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  process.env.HARVEST_ADMIN_EMAILS = 'host@example.com'
  state.sessions = [
    { id: 's-mine-1', code: 'AAAA', phase: 'lobby', player_count: 0, created_at: '2026-01-02', host_user_id: ME },
    { id: 's-mine-2', code: 'BBBB', phase: 'ended', player_count: 6, created_at: '2026-01-01', host_user_id: ME },
    { id: 's-other', code: 'CCCC', phase: 'lobby', player_count: 0, created_at: '2026-01-03', host_user_id: OTHER },
    { id: 's-anon', code: 'DDDD', phase: 'lobby', player_count: 0, created_at: '2026-01-04', host_user_id: null },
  ]
  authState.user = null
})
afterEach(() => vi.clearAllMocks())

describe('listSessionsByOwner', () => {
  it("returns only the caller's own sessions (anonymous + others excluded)", async () => {
    const mine = await listSessionsByOwner(ME)
    expect(mine.map((s) => s.id).sort()).toEqual(['s-mine-1', 's-mine-2'])
  })
  it('returns nothing for a user with no sessions', async () => {
    expect(await listSessionsByOwner('nobody')).toEqual([])
  })
})

describe('deleteOwnedSession (owner gate)', () => {
  it('deletes a session the user owns', async () => {
    expect(await deleteOwnedSession('s-mine-1', ME)).toBe('deleted')
    expect(state.sessions.find((s) => s.id === 's-mine-1')).toBeUndefined()
  })
  it("refuses to delete another host's session", async () => {
    expect(await deleteOwnedSession('s-other', ME)).toBe('not_owner')
    expect(state.sessions.find((s) => s.id === 's-other')).toBeDefined()
  })
  it('refuses to delete an anonymous session', async () => {
    expect(await deleteOwnedSession('s-anon', ME)).toBe('not_owner')
    expect(state.sessions.find((s) => s.id === 's-anon')).toBeDefined()
  })
  it('reports not_found for a missing session', async () => {
    expect(await deleteOwnedSession('nope', ME)).toBe('not_found')
  })
})

function delReq(id: string): Promise<Response> {
  return DELETE(new Request('http://x/api/host/sessions/' + id, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  })
}

describe('DELETE /api/host/sessions/[id] — auth contract', () => {
  it('401 when not signed in', async () => {
    authState.user = null
    const res = await delReq('s-mine-1')
    expect(res.status).toBe(401)
    expect(state.sessions.find((s) => s.id === 's-mine-1')).toBeDefined()
  })

  it('403 when signed in but email not in the allow-list', async () => {
    authState.user = { id: ME, email: 'stranger@example.com' }
    const res = await delReq('s-mine-1')
    expect(res.status).toBe(403)
    expect(state.sessions.find((s) => s.id === 's-mine-1')).toBeDefined()
  })

  it("403 when host tries to delete a session they don't own", async () => {
    authState.user = { id: ME, email: 'host@example.com' }
    const res = await delReq('s-other')
    expect(res.status).toBe(403)
    expect(state.sessions.find((s) => s.id === 's-other')).toBeDefined()
  })

  it('404 when the session does not exist', async () => {
    authState.user = { id: ME, email: 'host@example.com' }
    const res = await delReq('does-not-exist')
    expect(res.status).toBe(404)
  })

  it('200 + row gone when the owner deletes their own session', async () => {
    authState.user = { id: ME, email: 'host@example.com' }
    const res = await delReq('s-mine-1')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(state.sessions.find((s) => s.id === 's-mine-1')).toBeUndefined()
  })
})
