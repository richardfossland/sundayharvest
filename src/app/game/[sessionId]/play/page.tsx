'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getIdentity, clearIdentity } from '@/lib/identity'
import { Session, Player, MyRole, GameEvent } from '@/types/game'
import { PhaseBar } from '@/components/game/PhaseBar'
import { RoleCard } from '@/components/game/RoleCard'
import { EndScreen } from '@/components/game/EndScreen'

type VoteReveal = { approved: boolean; votes: { player_id: string; value: string; weight: number }[] }
type WorkReveal = { fruit: boolean; weeds: number; fruits: number; work: number }

export default function PlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const router = useRouter()
  const [me] = useState(() => getIdentity())
  const [session, setSession] = useState<Session | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [role, setRole] = useState<MyRole | null>(null)
  const [conversion, setConversion] = useState<{ name: string } | null>(null)
  const [voteReveal, setVoteReveal] = useState<VoteReveal | null>(null)
  const [workReveal, setWorkReveal] = useState<WorkReveal | null>(null)
  const [busy, setBusy] = useState(false)
  const supabase = createClient()

  const fetchRole = useCallback(async () => {
    if (!me.playerId || !me.secret) return
    const { data } = await supabase.rpc('get_my_role', { p_player_id: me.playerId, p_secret: me.secret })
    if (data) setRole(data as MyRole)
  }, [me.playerId, me.secret, supabase])

  // Guard + initial load.
  useEffect(() => {
    if (!me.playerId || me.sessionId !== sessionId) {
      router.replace('/')
      return
    }
    supabase.from('sessions').select('*').eq('id', sessionId).single().then(({ data }) => {
      if (data) setSession(data as Session)
    })
    supabase.from('players').select('*').eq('session_id', sessionId).order('seat').then(({ data }) => {
      if (data) setPlayers(data as Player[])
    })
    fetchRole()
    // Mark online.
    supabase.rpc('set_online', { p_player_id: me.playerId, p_secret: me.secret, p_online: true })
    const offline = () =>
      supabase.rpc('set_online', { p_player_id: me.playerId, p_secret: me.secret, p_online: false })
    window.addEventListener('beforeunload', offline)
    return () => window.removeEventListener('beforeunload', offline)
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime.
  useEffect(() => {
    if (!me.playerId) return
    const sessionSub = supabase
      .channel(`h-session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'harvest', table: 'sessions', filter: `id=eq.${sessionId}` },
        (p) => setSession(p.new as Session))
      .subscribe()
    const playersSub = supabase
      .channel(`h-players-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'harvest', table: 'players', filter: `session_id=eq.${sessionId}` },
        () => {
          supabase.from('players').select('*').eq('session_id', sessionId).order('seat')
            .then(({ data }) => data && setPlayers(data as Player[]))
        })
      .subscribe()
    const eventsSub = supabase
      .channel(`h-events-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'harvest', table: 'events', filter: `session_id=eq.${sessionId}` },
        (p) => handleEvent(p.new as GameEvent))
      .subscribe()
    return () => {
      supabase.removeChannel(sessionSub)
      supabase.removeChannel(playersSub)
      supabase.removeChannel(eventsSub)
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleEvent(ev: GameEvent) {
    if (ev.type === 'conversion') {
      const p = ev.payload as { name: string; player_id: string }
      setConversion({ name: p.name })
      if (p.player_id === me.playerId) fetchRole()
      setTimeout(() => setConversion(null), 6000)
    } else if (ev.type === 'vote_result') {
      setVoteReveal(ev.payload as unknown as VoteReveal)
      setTimeout(() => setVoteReveal(null), 5000)
    } else if (ev.type === 'work_result') {
      setWorkReveal(ev.payload as unknown as WorkReveal)
      setTimeout(() => setWorkReveal(null), 5000)
    }
  }

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '—'
  const mySeat = players.find((p) => p.id === me.playerId)?.seat
  const isLeader = session?.leader_seat === mySeat
  const leaderName = players.find((p) => p.seat === session?.leader_seat)?.name
  const onTeam = !!session && session.proposed_team.includes(me.playerId ?? '')

  if (!session) return <Centered>Laster…</Centered>
  if (session.phase === 'ended') return <EndScreen session={session} />

  return (
    <main className="min-h-screen">
      {session.phase !== 'lobby' && session.phase !== 'role_reveal' && (
        <PhaseBar session={session} leaderName={leaderName} />
      )}

      {conversion && (
        <div className="border-b border-gold/40 bg-gold/15 px-4 py-3 text-center text-sm text-gold">
          ⚡ {conversion.name} har omvendt seg på veien til Damaskus. Hen er nå trofast.
        </div>
      )}

      <div className="mx-auto max-w-md px-5 py-6">
        {session.phase === 'lobby' && <Lobby players={players} />}

        {session.phase === 'role_reveal' && (
          <RoleReveal
            role={role}
            confirmed={players.find((p) => p.id === me.playerId)?.role_confirmed ?? false}
            onConfirm={async () => {
              await supabase.rpc('confirm_role', { p_player_id: me.playerId, p_secret: me.secret })
            }}
          />
        )}

        {session.phase === 'work_proposal' && (
          <Proposal
            session={session}
            players={players}
            isLeader={isLeader}
            leaderName={leaderName}
            role={role}
            busy={busy}
            onPropose={async (team) => {
              setBusy(true)
              await supabase.rpc('propose_team', {
                p_session_id: sessionId, p_player_id: me.playerId, p_secret: me.secret, p_team: team,
              })
              setBusy(false)
            }}
            onConvert={async () => {
              setBusy(true)
              await supabase.rpc('convert_saul', { p_player_id: me.playerId, p_secret: me.secret })
              await fetchRole()
              setBusy(false)
            }}
          />
        )}

        {session.phase === 'work_vote' && (
          <VotePhase
            session={session}
            nameOf={nameOf}
            role={role}
            voteReveal={voteReveal}
            busy={busy}
            onVote={async (value) => {
              setBusy(true)
              await supabase.rpc('cast_vote', { p_player_id: me.playerId, p_secret: me.secret, p_value: value })
              setBusy(false)
            }}
            onConvert={async () => {
              setBusy(true)
              await supabase.rpc('convert_saul', { p_player_id: me.playerId, p_secret: me.secret })
              await fetchRole()
              setBusy(false)
            }}
          />
        )}

        {session.phase === 'work_execution' && (
          <Execution
            session={session}
            onTeam={onTeam}
            role={role}
            workReveal={workReveal}
            nameOf={nameOf}
            busy={busy}
            onCard={async (card) => {
              setBusy(true)
              await supabase.rpc('submit_card', { p_player_id: me.playerId, p_secret: me.secret, p_card: card })
              setBusy(false)
            }}
          />
        )}

        {session.phase === 'judas_phase' && (
          <Judas
            players={players}
            meId={me.playerId!}
            isJudas={role?.role === 'judas'}
            busy={busy}
            onStrike={async (targetId) => {
              setBusy(true)
              await supabase.rpc('judas_strike', {
                p_session_id: sessionId, p_player_id: me.playerId, p_secret: me.secret, p_target_id: targetId,
              })
              setBusy(false)
            }}
          />
        )}
      </div>
    </main>
  )
}

// ── Phase bodies ─────────────────────────────────────────────────────────────

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center text-muted">{children}</div>
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-in rounded-2xl border border-border bg-surface p-8 text-center text-muted">
      {children}
    </div>
  )
}

function Lobby({ players }: { players: Player[] }) {
  return (
    <div className="animate-fade-in flex flex-col gap-4">
      <h2 className="font-display text-2xl text-gold">I lobbyen</h2>
      <p className="text-sm text-muted">Venter på at verten starter spillet…</p>
      <div className="flex flex-wrap gap-2">
        {players.map((p) => (
          <span key={p.id} className="rounded-lg bg-border px-3 py-1.5 text-sm">{p.name}</span>
        ))}
      </div>
    </div>
  )
}

function RoleReveal({ role, confirmed, onConfirm }: { role: MyRole | null; confirmed: boolean; onConfirm: () => void }) {
  if (!role) return <Waiting>Deler ut roller…</Waiting>
  return (
    <div className="flex flex-col gap-5">
      <RoleCard role={role} />
      {confirmed ? (
        <Waiting>Du har lest rollen din. Venter på de andre…</Waiting>
      ) : (
        <button onClick={onConfirm} className="rounded-xl bg-sage py-3 font-medium text-ink">
          Jeg har lest rollen min
        </button>
      )}
    </div>
  )
}

function ConvertButton({ onConvert, busy }: { onConvert: () => void; busy: boolean }) {
  const [confirm, setConfirm] = useState(false)
  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="w-full rounded-xl border border-gold/50 bg-gold/10 py-3 text-sm font-medium text-gold"
      >
        ⚡ Omvend deg
      </button>
    )
  }
  return (
    <div className="rounded-xl border border-gold/50 bg-field p-4">
      <p className="text-sm text-text">
        Dette kan ikke angres. Du blir trofast — men blindet. Du mister synet på de andre forræderne.
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setConfirm(false)} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted">
          Avbryt
        </button>
        <button onClick={onConvert} disabled={busy} className="flex-1 rounded-lg bg-gold py-2 text-sm font-medium text-ink disabled:opacity-50">
          Omvend deg
        </button>
      </div>
    </div>
  )
}

function Proposal({
  session, players, isLeader, leaderName, role, busy, onPropose, onConvert,
}: {
  session: Session; players: Player[]; isLeader: boolean; leaderName?: string
  role: MyRole | null; busy: boolean
  onPropose: (team: string[]) => void; onConvert: () => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const need = session.team_sizes[session.current_work - 1] ?? 0
  const canConvert = role?.role === 'saulus' && !role.converted

  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < need ? [...cur, id] : cur))

  return (
    <div className="animate-fade-in flex flex-col gap-4">
      {isLeader ? (
        <>
          <div>
            <h2 className="font-display text-2xl text-gold">Du er Eldste</h2>
            <p className="text-sm text-muted">Velg {need} til å gå ut på gjerningen.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className={`rounded-xl border-2 px-3 py-3 text-sm transition-colors ${
                  picked.includes(p.id)
                    ? 'border-sage bg-sage/20 text-text'
                    : 'border-border bg-surface text-muted'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => onPropose(picked)}
            disabled={picked.length !== need || busy}
            className="rounded-xl bg-gold py-3 font-medium text-ink disabled:opacity-40"
          >
            Send ut laget ({picked.length}/{need})
          </button>
        </>
      ) : (
        <Waiting>
          <span className="text-text">{leaderName}</span> velger hvem som skal gå ut…
        </Waiting>
      )}
      {canConvert && <ConvertButton onConvert={onConvert} busy={busy} />}
    </div>
  )
}

function VotePhase({
  session, nameOf, role, voteReveal, busy, onVote, onConvert,
}: {
  session: Session; nameOf: (id: string) => string; role: MyRole | null
  voteReveal: VoteReveal | null; busy: boolean
  onVote: (v: 'approve' | 'reject') => void; onConvert: () => void
}) {
  const [voted, setVoted] = useState(false)
  const canConvert = role?.role === 'saulus' && !role.converted

  if (voteReveal) {
    return (
      <div className="animate-fade-in flex flex-col gap-4">
        <h2 className="text-center font-display text-2xl text-gold">
          {voteReveal.approved ? 'GODKJENT' : 'AVVIST'}
        </h2>
        <div className="flex flex-col gap-1.5">
          {voteReveal.votes.map((v) => (
            <div key={v.player_id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
              <span>{nameOf(v.player_id)}{v.weight === 2 && <span className="ml-1 text-xs text-gold">×2</span>}</span>
              <span className={v.value === 'approve' ? 'text-sage' : 'text-blight-text'}>
                {v.value === 'approve' ? '✓ Godkjenn' : '✗ Avvis'}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in flex flex-col gap-4">
      <div>
        <h2 className="font-display text-2xl text-gold">Stem over laget</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {session.proposed_team.map((id) => (
            <span key={id} className="rounded-lg bg-border px-3 py-1.5 text-sm">{nameOf(id)}</span>
          ))}
        </div>
      </div>
      {voted ? (
        <Waiting>Stemmen din er avgitt. Venter på de andre…</Waiting>
      ) : (
        <div className="flex gap-3">
          <button onClick={() => { onVote('approve'); setVoted(true) }} disabled={busy}
            className="flex-1 rounded-xl bg-sage py-4 font-medium text-ink disabled:opacity-50">
            Godkjenn
          </button>
          <button onClick={() => { onVote('reject'); setVoted(true) }} disabled={busy}
            className="flex-1 rounded-xl bg-blight py-4 font-medium text-text disabled:opacity-50">
            Avvis
          </button>
        </div>
      )}
      {canConvert && <ConvertButton onConvert={onConvert} busy={busy} />}
    </div>
  )
}

function Execution({
  session, onTeam, role, workReveal, busy, onCard,
}: {
  session: Session; onTeam: boolean; role: MyRole | null
  workReveal: WorkReveal | null; nameOf: (id: string) => string; busy: boolean
  onCard: (c: 'fruit' | 'weed') => void
}) {
  const [played, setPlayed] = useState(false)
  const faithful = role?.team === 'faithful'

  if (workReveal) {
    return (
      <div className="animate-fade-in flex flex-col items-center gap-3 py-6 text-center">
        <div className="text-5xl" aria-hidden>{workReveal.fruit ? '🌾' : '🥀'}</div>
        <p className="text-sm text-muted">{workReveal.fruits} frukt · {workReveal.weeds} ugress</p>
        <h2 className="font-display text-2xl text-gold">
          {workReveal.fruit ? 'Gjerningen bar frukt' : 'Gjerningen visnet blant ugresset'}
        </h2>
      </div>
    )
  }

  if (!onTeam) return <Waiting>Laget gjør gjerningen sin…</Waiting>
  if (played) return <Waiting>Kortet ditt er spilt. Venter på resten av laget…</Waiting>

  return (
    <div className="animate-fade-in flex flex-col gap-4">
      <h2 className="font-display text-2xl text-gold">Spill kortet ditt</h2>
      <div className="flex gap-3">
        <button onClick={() => { onCard('fruit'); setPlayed(true) }} disabled={busy}
          className="flex-1 rounded-2xl border-2 border-sage bg-sage/20 py-8 text-center disabled:opacity-50">
          <div className="text-4xl" aria-hidden>🌾</div>
          <div className="mt-2 font-medium text-text">Frukt</div>
        </button>
        <button
          onClick={() => { if (!faithful) { onCard('weed'); setPlayed(true) } }}
          disabled={faithful || busy}
          className={`flex-1 rounded-2xl border-2 py-8 text-center ${
            faithful ? 'border-border bg-surface opacity-40' : 'border-blight bg-blight/20'
          }`}
        >
          <div className="text-4xl" aria-hidden>🥀</div>
          <div className="mt-2 font-medium text-text">Ugress</div>
          {faithful && <div className="mt-1 text-xs text-muted">Du er trofast</div>}
        </button>
      </div>
    </div>
  )
}

function Judas({
  players, meId, isJudas, busy, onStrike,
}: {
  players: Player[]; meId: string; isJudas: boolean; busy: boolean; onStrike: (id: string) => void
}) {
  const [target, setTarget] = useState<string | null>(null)
  if (!isJudas) {
    return (
      <Waiting>
        <p className="text-text">Flokken fullførte tre gjerninger…</p>
        <p className="mt-1">men Judas reiser seg.</p>
      </Waiting>
    )
  }
  return (
    <div className="animate-fade-in flex flex-col gap-4">
      <div>
        <h2 className="font-display text-2xl text-gold">Ett siste forsøk</h2>
        <p className="text-sm text-muted">Pek ut den du tror er Profeten.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {players.filter((p) => p.id !== meId).map((p) => (
          <button key={p.id} onClick={() => setTarget(p.id)}
            className={`rounded-xl border-2 px-3 py-3 text-sm ${
              target === p.id ? 'border-blight bg-blight/25 text-text' : 'border-border bg-surface text-muted'
            }`}>
            {p.name}
          </button>
        ))}
      </div>
      <button onClick={() => target && onStrike(target)} disabled={!target || busy}
        className="rounded-xl bg-blight py-3 font-medium text-text disabled:opacity-40">
        Pek ut Profeten
      </button>
    </div>
  )
}
