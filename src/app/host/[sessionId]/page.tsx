'use client'

import { useEffect, useState, useRef, use } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getHostId, ensureHostId } from '@/lib/identity'
import { Session, Player, GameEvent } from '@/types/game'
import { TEAM_SIZES, BETRAYER_COUNT, MIN_PLAYERS, MAX_PLAYERS, ROLES } from '@/lib/config'
import { buildRoleList, dealAssignments, DeckToggles } from '@/lib/deal'
import { WorkTrack, RejectDots } from '@/components/game/WorkTrack'
import { workResults } from '@/components/game/PhaseBar'

export default function HostPanel({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const [session, setSession] = useState<Session | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [events, setEvents] = useState<GameEvent[]>([])
  const [toggles, setToggles] = useState<DeckToggles>({
    useShepherd: true, useSerpent: true, useSaulus: false, useBarnabas: false,
  })
  const [busy, setBusy] = useState(false)
  const hostId = useRef<string>('')
  const resolving = useRef(false)
  const supabase = createClient()

  useEffect(() => {
    hostId.current = getHostId(sessionId) ?? ensureHostId()
    supabase.from('sessions').select('*').eq('id', sessionId).single().then(({ data }) => data && setSession(data as Session))
    refreshPlayers()
    supabase.from('events').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => data && setEvents(data as GameEvent[]))

    const s = supabase.channel(`hh-session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'harvest', table: 'sessions', filter: `id=eq.${sessionId}` },
        (p) => setSession(p.new as Session)).subscribe()
    const pl = supabase.channel(`hh-players-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'harvest', table: 'players', filter: `session_id=eq.${sessionId}` },
        refreshPlayers).subscribe()
    const ev = supabase.channel(`hh-events-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'harvest', table: 'events', filter: `session_id=eq.${sessionId}` },
        (p) => setEvents((cur) => [p.new as GameEvent, ...cur].slice(0, 8))).subscribe()
    return () => { supabase.removeChannel(s); supabase.removeChannel(pl); supabase.removeChannel(ev) }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  function refreshPlayers() {
    supabase.from('players').select('*').eq('session_id', sessionId).order('seat')
      .then(({ data }) => data && setPlayers(data as Player[]))
  }

  // Auto-resolve once everyone has acted (host is the trusted resolver).
  useEffect(() => {
    if (!session) return
    if (session.phase !== 'work_vote' && session.phase !== 'work_execution') return
    const tick = setInterval(async () => {
      if (resolving.current) return
      if (session.phase === 'work_vote') {
        const { data } = await supabase.rpc('vote_progress', { p_session_id: sessionId })
        if (data && data.submitted >= data.total) {
          resolving.current = true
          await supabase.rpc('resolve_vote', { p_session_id: sessionId, p_host_id: hostId.current })
          resolving.current = false
        }
      } else if (session.phase === 'work_execution') {
        const { data } = await supabase.rpc('work_progress', { p_session_id: sessionId, p_work: session.current_work })
        if (data && data.total > 0 && data.submitted >= data.total) {
          resolving.current = true
          await supabase.rpc('resolve_work', { p_session_id: sessionId, p_host_id: hostId.current })
          resolving.current = false
        }
      }
    }, 1200)
    return () => clearInterval(tick)
  }, [session?.phase, session?.current_work]) // eslint-disable-line react-hooks/exhaustive-deps

  const n = players.length
  const legal = n >= MIN_PLAYERS && n <= MAX_PLAYERS
  const deck = legal ? buildRoleList(n, toggles) : []

  async function startGame() {
    if (!legal) return
    setBusy(true)
    const roles = buildRoleList(n, toggles)
    const assignments = dealAssignments(players, roles)
    await supabase.rpc('commit_deal', {
      p_session_id: sessionId, p_host_id: hostId.current,
      p_assignments: assignments, p_team_sizes: TEAM_SIZES[n],
    })
    setBusy(false)
  }

  async function forceResolve() {
    if (!session) return
    setBusy(true)
    if (session.phase === 'work_vote')
      await supabase.rpc('resolve_vote', { p_session_id: sessionId, p_host_id: hostId.current })
    else if (session.phase === 'work_execution')
      await supabase.rpc('resolve_work', { p_session_id: sessionId, p_host_id: hostId.current })
    setBusy(false)
  }

  if (!session) return <div className="p-10 text-center text-[#9A92A8]">Laster…</div>

  return (
    <main className="mx-auto max-w-lg px-5 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl text-[#E3B23C]">SundayHarvest — vert</h1>
        <Link href={`/host/${sessionId}/projector`} target="_blank"
          className="rounded-lg border border-[#352E47] px-3 py-1.5 text-sm text-[#9A92A8]">
          Storskjerm ↗
        </Link>
      </header>

      {session.phase === 'lobby' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-[#352E47] bg-[#262035] p-5 text-center">
            <p className="text-xs uppercase tracking-wide text-[#9A92A8]">Spillkode</p>
            <p className="font-display text-5xl tracking-[0.2em] text-[#E3B23C]">{session.code}</p>
          </div>

          <div>
            <p className="mb-2 text-sm text-[#9A92A8]">{n} spillere</p>
            <div className="flex flex-wrap gap-2">
              {players.map((p) => (
                <span key={p.id} className="rounded-lg bg-[#352E47] px-3 py-1.5 text-sm">
                  {p.name}{!p.is_online && <span className="ml-1 text-[#9A92A8]">·</span>}
                </span>
              ))}
              {n === 0 && <span className="text-sm text-[#9A92A8]">Venter på spillere…</span>}
            </div>
          </div>

          <RolePicker toggles={toggles} setToggles={setToggles} n={n} deck={deck} legal={legal} />

          <button onClick={startGame} disabled={!legal || busy}
            className="rounded-xl bg-[#E3B23C] py-3.5 font-medium text-[#1A1626] disabled:opacity-40">
            {n < MIN_PLAYERS ? `Trenger minst ${MIN_PLAYERS} spillere`
              : n > MAX_PLAYERS ? `Maks ${MAX_PLAYERS} spillere`
              : busy ? '…' : `Start spillet (${n} spillere)`}
          </button>
        </div>
      )}

      {session.phase === 'role_reveal' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-[#352E47] bg-[#262035] p-5 text-center">
            <h2 className="font-display text-xl text-[#E3B23C]">Rollene er delt ut</h2>
            <p className="mt-1 text-sm text-[#9A92A8]">
              {players.filter((p) => p.role_confirmed).length}/{players.length} har lest rollen sin
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {players.map((p) => (
                <span key={p.id}
                  className={`rounded-lg px-3 py-1.5 text-sm ${p.role_confirmed ? 'bg-[#6B8F5E]/25 text-[#6B8F5E]' : 'bg-[#352E47] text-[#9A92A8]'}`}>
                  {p.role_confirmed ? '✓ ' : ''}{p.name}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={async () => {
              setBusy(true)
              await supabase.rpc('begin_works', { p_session_id: sessionId, p_host_id: hostId.current })
              setBusy(false)
            }}
            disabled={busy || (players.length > 0 && !players.every((p) => p.role_confirmed))}
            className="rounded-xl bg-[#E3B23C] py-3.5 font-medium text-[#1A1626] disabled:opacity-40"
          >
            {players.every((p) => p.role_confirmed) ? 'Start gjerningene' : 'Venter på at alle leser rollen…'}
          </button>
        </div>
      )}

      {session.phase !== 'lobby' && session.phase !== 'role_reveal' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-[#352E47] bg-[#262035] p-5">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-display text-[#E3B23C]">Gjerning {session.current_work}/5</span>
              <PhaseLabel phase={session.phase} />
            </div>
            <WorkTrack results={workResults(session)} current={session.current_work} />
            <div className="mt-4 flex items-center justify-between text-xs text-[#9A92A8]">
              <span>
                Eldste: <span className="text-[#F2EFE6]">
                  {players.find((p) => p.seat === session.leader_seat)?.name ?? '—'}
                </span>
              </span>
              <span className="flex items-center gap-2">Avvisninger <RejectDots count={session.reject_count} /></span>
            </div>
          </div>

          {(session.phase === 'work_vote' || session.phase === 'work_execution') && (
            <button onClick={forceResolve} disabled={busy}
              className="rounded-xl border border-[#352E47] bg-[#262035] py-3 text-sm text-[#9A92A8] disabled:opacity-50">
              Tving fram resultat (manglende stemmer = avvis · manglende kort = frukt)
            </button>
          )}

          <EventFeed events={events} />
        </div>
      )}
    </main>
  )
}

function RolePicker({
  toggles, setToggles, n, deck, legal,
}: {
  toggles: DeckToggles; setToggles: (t: DeckToggles) => void; n: number; deck: string[]; legal: boolean
}) {
  const t = (k: keyof DeckToggles) => () => setToggles({ ...toggles, [k]: !toggles[k] })
  const counts = deck.reduce<Record<string, number>>((acc, r) => ((acc[r] = (acc[r] ?? 0) + 1), acc), {})
  return (
    <div className="rounded-2xl border border-[#352E47] bg-[#262035] p-4">
      <p className="mb-3 text-xs uppercase tracking-wide text-[#9A92A8]">Sett sammen kortstokken</p>
      <div className="flex flex-col gap-2">
        <Toggle label="Vekteren + Den falske profeten" hint="Parvis — begge eller ingen" on={toggles.useShepherd} onClick={t('useShepherd')} />
        <Toggle label="Slangen" hint="Skjult for Profeten" on={toggles.useSerpent} onClick={t('useSerpent')} />
        <Toggle label="Saulus" hint="Kan omvende seg én gang (best 7+)" on={toggles.useSaulus} onClick={t('useSaulus')} />
        <Toggle label="Barnabas" hint="Dobbel stemme — men blir kjent som trofast" on={toggles.useBarnabas} onClick={t('useBarnabas')} />
      </div>
      {legal && (
        <div className="mt-4 border-t border-[#352E47] pt-3">
          <p className="mb-1 text-xs text-[#9A92A8]">
            Kortstokk for {n}: {BETRAYER_COUNT[n]} forrædere
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(counts).map(([r, c]) => (
              <span key={r} className="rounded bg-[#1A1626] px-2 py-1 text-xs text-[#F2EFE6]">
                {ROLES[r as keyof typeof ROLES].label}{c > 1 ? ` ×${c}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Toggle({ label, hint, on, onClick }: { label: string; hint: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between rounded-xl border border-[#352E47] bg-[#1A1626] px-3 py-2.5 text-left">
      <span>
        <span className="block text-sm text-[#F2EFE6]">{label}</span>
        <span className="block text-xs text-[#9A92A8]">{hint}</span>
      </span>
      <span className={`ml-3 h-6 w-11 flex-shrink-0 rounded-full p-0.5 transition-colors ${on ? 'bg-[#6B8F5E]' : 'bg-[#352E47]'}`}>
        <span className={`block h-5 w-5 rounded-full bg-[#F2EFE6] transition-transform ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  )
}

function PhaseLabel({ phase }: { phase: string }) {
  const map: Record<string, string> = {
    role_reveal: 'Rolleutdeling', work_proposal: 'Forslag', work_vote: 'Avstemning',
    work_execution: 'Gjerning pågår', judas_phase: 'Judas reiser seg', ended: 'Slutt',
  }
  return <span className="text-[#9A92A8]">{map[phase] ?? phase}</span>
}

function EventFeed({ events }: { events: GameEvent[] }) {
  function line(ev: GameEvent): string {
    const p = ev.payload as Record<string, unknown>
    if (ev.type === 'conversion') return `⚡ ${p.name} omvendte seg (gjerning ${p.work})`
    if (ev.type === 'vote_result') return p.approved ? '✓ Laget godkjent' : '✗ Laget avvist'
    if (ev.type === 'work_result') return `${p.fruit ? '🌾 Bar frukt' : '🥀 Visnet'} (${p.weeds} ugress)`
    return ev.type
  }
  if (!events.length) return null
  return (
    <div className="rounded-2xl border border-[#352E47] bg-[#262035] p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-[#9A92A8]">Hendelser</p>
      <div className="flex flex-col gap-1.5 text-sm text-[#F2EFE6]">
        {events.map((e) => <div key={e.id}>{line(e)}</div>)}
      </div>
    </div>
  )
}
