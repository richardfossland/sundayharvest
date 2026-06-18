'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Session, RevealRow } from '@/types/game'
import { ROLES } from '@/lib/config'
import { WorkTrack } from './WorkTrack'
import { workResults } from './PhaseBar'
import { pickStaticDebrief } from '@/lib/debrief/staticBank'
import type {
  DebriefContent,
  DebriefGameState,
  DebriefResponse,
} from '@/lib/debrief/types'

// Final reveal + theological debrief (PLAN-AMENDMENTS §B). The debrief is the
// point: the game is the parable, and the parable says we don't get to sort
// hearts — God does, at the harvest (Matt 13:29-30).
export function EndScreen({ session }: { session: Session }) {
  const [rows, setRows] = useState<RevealRow[] | null>(null)
  const betrayerWin = session.outcome === 'betrayer_win'
  const judasWin = betrayerWin && session.fruit_works >= 3

  useEffect(() => {
    const supabase = createClient()
    supabase.rpc('get_final_reveal', { p_session_id: session.id }).then(({ data }) => {
      if (data) setRows(data as RevealRow[])
    })
  }, [session.id])

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <div className="animate-fade-in flex flex-col gap-6">
        <div className="text-center">
          <div className="mb-2 text-5xl" aria-hidden>{betrayerWin ? '🥀' : '🌾'}</div>
          <h1 className="font-display text-3xl font-semibold text-[#E3B23C]">
            {betrayerWin ? 'Forræderne vant' : 'Flokken seiret'}
          </h1>
          {judasWin && (
            <p className="mt-2 text-sm text-[#9A92A8]">
              Judas pekte ut Profeten — som han en gang pekte ut Mesteren med et kyss. Men husk
              hvordan det gikk med Judas (Matt 27).
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[#352E47] bg-[#262035] p-4">
          <WorkTrack results={workResults(session)} />
          <p className="mt-3 text-center text-xs text-[#9A92A8]">
            {session.fruit_works} bar frukt · {session.choked_works} visnet
          </p>
        </div>

        {rows && (
          <div className="rounded-2xl border border-[#352E47] bg-[#262035] p-1">
            {rows.map((r) => {
              const meta = ROLES[r.role]
              return (
                <div
                  key={r.seat}
                  className="flex items-center justify-between border-b border-[#352E47] px-3 py-2.5 last:border-0"
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{meta.emoji}</span>
                    <span className="text-sm text-[#F2EFE6]">{r.name}</span>
                  </span>
                  <span className="text-right">
                    <span
                      className={`text-sm ${
                        r.team === 'faithful' ? 'text-[#6B8F5E]' : 'text-[#cf8a8a]'
                      }`}
                    >
                      {meta.label}
                    </span>
                    {r.converted && (
                      <span className="block text-[10px] text-[#E3B23C]">
                        omvendte seg i gjerning {r.converted_on_work}
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <Debrief session={session} rows={rows} />
      </div>
    </main>
  )
}

// Anonymized snapshot for the AI debrief: aggregate facts only — no names/ids.
function gameStateFor(session: Session, rows: RevealRow[] | null): DebriefGameState {
  return {
    outcome: session.outcome === 'betrayer_win' ? 'betrayer_win' : 'faithful_win',
    fruitWorks: session.fruit_works,
    chokedWorks: session.choked_works,
    playerCount: session.player_count,
    judasWon: session.outcome === 'betrayer_win' && session.fruit_works >= 3,
    saulusConverted: !!rows?.some((r) => r.converted),
    rolesInPlay: rows ? Array.from(new Set(rows.map((r) => r.role))) : [],
  }
}

function Debrief({ session, rows }: { session: Session; rows: RevealRow[] | null }) {
  // AI-generated content layers ON TOP of the static debrief below. If the
  // route reports no key (or anything fails), `ai` stays null and the static
  // text is all the host sees — no regression.
  const [ai, setAi] = useState<DebriefContent | null>(null)
  const [loading, setLoading] = useState(false)

  async function ask(variant: 'initial' | 'more') {
    setLoading(true)
    try {
      const res = await fetch('/api/debrief', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game: gameStateFor(session, rows), variant }),
      })
      const data = (await res.json()) as DebriefResponse
      if (data.available) setAi(data.content)
    } catch {
      // Swallow — static debrief remains the fallback.
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {ai && (
        <div className="rounded-2xl border border-[#E3B23C]/40 bg-[#1A1626] p-5">
          <p className="mb-2 text-xs uppercase tracking-wide text-[#9A92A8]">
            Samtaleleder (KI-forslag)
          </p>
          <p className="text-sm leading-relaxed text-[#F2EFE6]">{ai.andakt}</p>
          <div className="mt-4 border-t border-[#352E47] pt-4">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-[#F2EFE6]">
              {ai.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => ask(ai ? 'more' : 'initial')}
          disabled={loading}
          className="rounded-xl border border-[#E3B23C]/40 bg-[#262035] px-4 py-2 text-sm text-[#E3B23C] disabled:opacity-50"
        >
          {loading
            ? 'Henter…'
            : ai
              ? 'Be om flere spørsmål'
              : 'Lag samtalespørsmål med KI'}
        </button>
      </div>

      <StaticDebrief seed={session.id} />
    </>
  )
}

function StaticDebrief({ seed }: { seed: string }) {
  // One of several themed andakt/spørsmål variants, chosen deterministically per
  // game (see staticBank.ts) so replays get fresh framing without an AI key.
  const entry = pickStaticDebrief(seed)
  return (
    <div className="rounded-2xl border border-[#E3B23C]/30 bg-[#1A1626] p-5">
      <h2 className="font-display text-lg text-[#E3B23C]">{entry.title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[#F2EFE6]">
        {entry.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="mt-4 border-t border-[#352E47] pt-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-[#9A92A8]">Til samtale</p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-[#F2EFE6]">
          {entry.questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-center text-xs italic text-[#9A92A8]">{entry.verse}</p>
    </div>
  )
}
