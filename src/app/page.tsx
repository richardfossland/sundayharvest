'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { setIdentity, ensureHostId, bindHostSession } from '@/lib/identity'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { cn } from '@/lib/cn'

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
          <h1 className="font-display text-4xl font-semibold tracking-tight text-gold">
            SundayHarvest
          </h1>
          <p className="mt-2 text-sm text-muted">
            La hveten og ugresset vokse sammen — til høsten.
          </p>
        </div>

        <div className="mb-6 flex rounded-xl border border-border bg-surface p-1">
          {(['join', 'host'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors',
                mode === m ? 'bg-gold text-ink' : 'text-muted hover:text-text',
              )}
            >
              {m === 'join' ? 'Bli med' : 'Vert'}
            </button>
          ))}
        </div>

        {mode === 'join' ? (
          <div className="flex flex-col gap-3">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Spillkode"
              maxLength={4}
              autoCapitalize="characters"
              aria-label="Spillkode"
              className="text-center font-display text-2xl tracking-[0.3em] focus:border-gold placeholder:text-base placeholder:tracking-normal"
            />
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Navnet ditt"
              maxLength={24}
              aria-label="Navnet ditt"
            />
            <Button variant="sage" onClick={join} disabled={busy}>
              {busy ? 'Blir med…' : 'Bli med i flokken'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm text-muted">
              Opprett et spill og vis koden + storskjermen for gruppa. Trenger 5–10 spillere.
            </p>
            <Button onClick={host} disabled={busy}>
              {busy ? 'Oppretter…' : 'Opprett spill'}
            </Button>
          </div>
        )}

        {error && <ErrorText className="mt-4">{error}</ErrorText>}

        <p className="mt-10 text-center text-xs leading-relaxed text-muted">
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
        <h1 className="font-display text-4xl font-semibold tracking-tight text-gold">
          SundayHarvest
        </h1>
      </div>
    </main>
  )
}
