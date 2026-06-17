'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { setIdentity, ensureHostId, bindHostSession } from '@/lib/identity'

/** Normalise a scanned/typed code to the 4-letter shape the lobby uses. */
function normalizeCode(raw: string | null): string {
  if (!raw) return ''
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
}

export default function Landing() {
  // useSearchParams() requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<LandingShell />}>
      <LandingInner />
    </Suspense>
  )
}

function LandingInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefilledCode = normalizeCode(searchParams.get('code'))
  const [mode, setMode] = useState<'join' | 'host'>('join')
  const [code, setCode] = useState(prefilledCode)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  // Deep-link from the projector QR: ?code=XXXX prefills the code, forces the
  // "join" tab, and jumps focus straight to the name field (the only thing the
  // player still has to type). No DB/secret involved — purely the join form.
  useEffect(() => {
    if (!prefilledCode) return
    setMode('join')
    setCode(prefilledCode)
    nameRef.current?.focus()
  }, [prefilledCode])

  async function join() {
    setError('')
    if (!code.trim() || !name.trim()) return setError('Fyll inn kode og navn.')
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('join_session', {
      p_code: code.trim().toUpperCase(),
      p_name: name.trim(),
    })
    setBusy(false)
    if (error) return setError(error.message)
    if (!data?.ok) return setError(data?.error ?? 'Kunne ikke bli med.')
    setIdentity(data.player_id, data.session_id, data.secret)
    router.push(`/game/${data.session_id}/play`)
  }

  async function host() {
    setError('')
    setBusy(true)
    const supabase = createClient()
    const hostId = ensureHostId()
    // Session creation goes through the create_session SECURITY DEFINER RPC:
    // 0002 revokes direct anon INSERT on harvest.sessions (game-integrity lockdown).
    const { data, error } = await supabase.rpc('create_session', { p_host_id: hostId })
    setBusy(false)
    if (error) return setError(error.message)
    if (!data?.ok) return setError(data?.error ?? 'Kunne ikke opprette spill.')
    bindHostSession(data.id)
    router.push(`/host/${data.id}`)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      <div className="animate-fade-in w-full">
        <div className="mb-8 text-center">
          <div className="mb-2 text-5xl animate-sway inline-block" aria-hidden>🌾</div>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-[#E3B23C]">
            SundayHarvest
          </h1>
          <p className="mt-2 text-sm text-[#9A92A8]">
            La hveten og ugresset vokse sammen — til høsten.
          </p>
        </div>

        <div className="mb-6 flex rounded-xl border border-[#352E47] bg-[#262035] p-1">
          {(['join', 'host'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                mode === m ? 'bg-[#E3B23C] text-[#1A1626]' : 'text-[#9A92A8]'
              }`}
            >
              {m === 'join' ? 'Bli med' : 'Vert'}
            </button>
          ))}
        </div>

        {mode === 'join' ? (
          <div className="flex flex-col gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Spillkode"
              maxLength={4}
              autoCapitalize="characters"
              className="rounded-xl border border-[#352E47] bg-[#262035] px-4 py-3 text-center font-display text-2xl tracking-[0.3em] text-[#F2EFE6] placeholder:tracking-normal placeholder:text-base placeholder:text-[#9A92A8] focus:border-[#E3B23C] focus:outline-none"
            />
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Navnet ditt"
              maxLength={24}
              className="rounded-xl border border-[#352E47] bg-[#262035] px-4 py-3 text-[#F2EFE6] placeholder:text-[#9A92A8] focus:border-[#E3B23C] focus:outline-none"
            />
            <button
              onClick={join}
              disabled={busy}
              className="rounded-xl bg-[#6B8F5E] py-3 font-medium text-[#1A1626] transition-opacity disabled:opacity-50"
            >
              {busy ? '…' : 'Bli med i flokken'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm text-[#9A92A8]">
              Opprett et spill og vis koden + storskjermen for gruppa. Trenger 5–10 spillere.
            </p>
            <button
              onClick={host}
              disabled={busy}
              className="rounded-xl bg-[#E3B23C] py-3 font-medium text-[#1A1626] transition-opacity disabled:opacity-50"
            >
              {busy ? '…' : 'Opprett spill'}
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-center text-sm text-[#8B3A3A]">{error}</p>}

        <p className="mt-10 text-center text-xs leading-relaxed text-[#9A92A8]">
          Ingen blir slått ut. Alle spiller hele veien. Du dømmer gjerninger — ikke hjerter.
        </p>
      </div>
    </main>
  )
}

/** Minimal chrome shown while the search-param-reading client tree hydrates. */
function LandingShell() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      <div className="text-center">
        <div className="mb-2 inline-block animate-sway text-5xl" aria-hidden>🌾</div>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-[#E3B23C]">
          SundayHarvest
        </h1>
      </div>
    </main>
  )
}
