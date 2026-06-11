'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Session, Player, GameEvent } from '@/types/game'
import { TWO_WEED_WORKS } from '@/lib/config'
import { WorkTrack, RejectDots } from '@/components/game/WorkTrack'
import { workResults } from '@/components/game/PhaseBar'

type VoteReveal = { approved: boolean; votes: { player_id: string; value: string }[] }
type WorkReveal = { fruit: boolean; weeds: number; fruits: number }

export default function Projector({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const [session, setSession] = useState<Session | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [damascus, setDamascus] = useState<string | null>(null)
  const [voteReveal, setVoteReveal] = useState<VoteReveal | null>(null)
  const [workReveal, setWorkReveal] = useState<WorkReveal | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('sessions').select('*').eq('id', sessionId).single().then(({ data }) => data && setSession(data as Session))
    supabase.from('players').select('*').eq('session_id', sessionId).order('seat').then(({ data }) => data && setPlayers(data as Player[]))
    const s = supabase.channel(`pj-session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'harvest', table: 'sessions', filter: `id=eq.${sessionId}` },
        (p) => setSession(p.new as Session)).subscribe()
    const pl = supabase.channel(`pj-players-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'harvest', table: 'players', filter: `session_id=eq.${sessionId}` },
        () => supabase.from('players').select('*').eq('session_id', sessionId).order('seat')
          .then(({ data }) => data && setPlayers(data as Player[]))).subscribe()
    const ev = supabase.channel(`pj-events-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'harvest', table: 'events', filter: `session_id=eq.${sessionId}` },
        (p) => {
          const e = p.new as GameEvent
          if (e.type === 'conversion') { setDamascus((e.payload as { name: string }).name); setTimeout(() => setDamascus(null), 2600) }
          else if (e.type === 'vote_result') { setVoteReveal(e.payload as unknown as VoteReveal); setTimeout(() => setVoteReveal(null), 5000) }
          else if (e.type === 'work_result') { setWorkReveal(e.payload as unknown as WorkReveal); setTimeout(() => setWorkReveal(null), 5000) }
        }).subscribe()
    return () => { supabase.removeChannel(s); supabase.removeChannel(pl); supabase.removeChannel(ev) }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '—'
  const leaderName = players.find((p) => p.seat === session?.leader_seat)?.name

  if (!session) return <Screen><span className="text-[#9A92A8]">Laster…</span></Screen>

  if (session.phase === 'lobby') {
    return (
      <Screen>
        <p className="text-3xl text-[#9A92A8]">Spillkode</p>
        <p className="font-display text-[12rem] leading-none tracking-[0.1em] text-[#E3B23C]">{session.code}</p>
        <p className="mt-8 text-2xl text-[#9A92A8]">{players.length} spillere · harvest.sundaysuite.app</p>
        <div className="mt-6 flex max-w-4xl flex-wrap justify-center gap-3">
          {players.map((p) => <span key={p.id} className="rounded-xl bg-[#262035] px-5 py-2.5 text-2xl">{p.name}</span>)}
        </div>
      </Screen>
    )
  }

  if (session.phase === 'ended') {
    const betrayerWin = session.outcome === 'betrayer_win'
    return (
      <Screen>
        <div className="text-8xl">{betrayerWin ? '🥀' : '🌾'}</div>
        <h1 className="mt-4 font-display text-7xl text-[#E3B23C]">{betrayerWin ? 'Forræderne vant' : 'Flokken seiret'}</h1>
        <div className="mt-10"><WorkTrack results={workResults(session)} large /></div>
      </Screen>
    )
  }

  return (
    <Screen>
      {damascus && (
        <div className="animate-damascus pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#E3B23C]">
          <p className="font-display text-6xl text-[#1A1626]">⚡ {damascus} har omvendt seg</p>
        </div>
      )}

      <div className="mb-12"><WorkTrack results={workResults(session)} current={session.current_work} twoWeedWork={(TWO_WEED_WORKS[session.player_count] ?? [])[0]} large /></div>

      {workReveal ? (
        <div className="text-center">
          <div className="text-9xl">{workReveal.fruit ? '🌾' : '🥀'}</div>
          <h1 className="mt-4 font-display text-6xl text-[#E3B23C]">{workReveal.fruit ? 'Gjerningen bar frukt' : 'Gjerningen visnet'}</h1>
          <p className="mt-4 text-3xl text-[#9A92A8]">{workReveal.fruits} frukt · {workReveal.weeds} ugress</p>
        </div>
      ) : voteReveal ? (
        <div className="text-center">
          <h1 className="font-display text-7xl text-[#E3B23C]">{voteReveal.approved ? 'GODKJENT' : 'AVVIST'}</h1>
          <div className="mt-8 grid max-w-4xl grid-cols-3 gap-3">
            {voteReveal.votes.map((v) => (
              <span key={v.player_id} className={`rounded-xl px-5 py-3 text-2xl ${v.value === 'approve' ? 'bg-[#6B8F5E]/25 text-[#6B8F5E]' : 'bg-[#8B3A3A]/25 text-[#cf8a8a]'}`}>
                {v.value === 'approve' ? '✓' : '✗'} {nameOf(v.player_id)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-3xl text-[#9A92A8]">Eldste</p>
          <h1 className="font-display text-8xl text-[#F2EFE6]">{leaderName ?? '—'}</h1>
          {session.phase === 'work_proposal' && <p className="mt-8 text-3xl text-[#9A92A8]">velger laget…</p>}
          {session.phase === 'work_vote' && (
            <div className="mt-8">
              <p className="text-3xl text-[#9A92A8]">Laget som stilles til avstemning:</p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                {session.proposed_team.map((id) => <span key={id} className="rounded-xl bg-[#262035] px-6 py-3 text-3xl">{nameOf(id)}</span>)}
              </div>
            </div>
          )}
          {session.phase === 'work_execution' && <p className="mt-8 text-4xl text-[#E3B23C]">Gjerningen pågår…</p>}
          {session.phase === 'judas_phase' && <p className="mt-8 text-4xl text-[#cf8a8a]">…men Judas reiser seg.</p>}
        </div>
      )}

      <div className="mt-16 flex items-center gap-4">
        <span className="text-2xl text-[#9A92A8]">Avvisninger</span>
        <RejectDots count={session.reject_count} large />
      </div>
    </Screen>
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#1A1626] px-12 py-12 text-center">
      {children}
    </main>
  )
}
