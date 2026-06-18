'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { createAuthBrowserClient } from '@/lib/supabase/auth-browser'
import { ensureHostId, bindHostSession } from '@/lib/identity'
import { hostStrings as t } from '@/lib/locale/host'
import type { OwnedSessionSummary } from '@/lib/server/host-sessions'

export function HostDashboard({
  email,
  sessions,
}: {
  email: string
  sessions: OwnedSessionSummary[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState(sessions)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCreate() {
    setCreating(true)
    setError(null)
    try {
      // The per-game console still authenticates with the device host_id, so the
      // signed-in host must own a stable host_id on this device. Pass it to the
      // create route so the session is created with the matching host_id.
      const hostId = ensureHostId()
      const res = await fetch('/api/host/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostId }),
      })
      if (!res.ok) throw new Error('create_failed')
      const { id } = (await res.json()) as { id: string }
      bindHostSession(id)
      router.push(`/host/${id}`)
    } catch {
      setError(t.createError)
      setCreating(false)
    }
  }

  async function onDelete(s: OwnedSessionSummary) {
    if (!window.confirm(t.confirmDelete(s.code))) return
    setDeletingId(s.id)
    setError(null)
    try {
      const res = await fetch(`/api/host/sessions/${s.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete_failed')
      setRows((prev) => prev.filter((x) => x.id !== s.id))
    } catch {
      setError(t.deleteError)
    } finally {
      setDeletingId(null)
    }
  }

  async function signOut() {
    try {
      const supabase = createAuthBrowserClient()
      await supabase.auth.signOut()
    } finally {
      router.replace('/host/login')
      router.refresh()
    }
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-8">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="font-display text-2xl text-[#E3B23C]">
          🌾 SundayHarvest
        </Link>
        <button
          onClick={signOut}
          className="rounded-lg border border-[#352E47] px-3 py-1.5 text-sm text-[#9A92A8]"
        >
          {t.signOut}
        </button>
      </header>

      <div className="mb-5">
        <h1 className="font-display text-2xl text-[#F2EFE6]">{t.dashTitle}</h1>
        <p className="mt-1 text-sm text-[#9A92A8]">{t.dashLead}</p>
        <p className="mt-1 text-xs text-[#9A92A8]">{t.signedInAs(email)}</p>
      </div>

      <button
        onClick={onCreate}
        disabled={creating}
        className="mb-5 w-full rounded-xl bg-[#E3B23C] py-3 font-medium text-[#1A1626] transition-opacity disabled:opacity-50"
      >
        {creating ? t.creating : t.createNew}
      </button>

      {error && <p className="mb-4 text-center text-sm text-[#8B3A3A]">{error}</p>}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-[#352E47] bg-[#262035] p-5 text-center text-sm text-[#9A92A8]">
          {t.empty}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-2xl border border-[#352E47] bg-[#262035] p-4"
            >
              <div>
                <p className="font-display text-xl tracking-[0.15em] text-[#E3B23C]">
                  {s.code}
                </p>
                <p className="mt-0.5 text-xs text-[#9A92A8]">
                  {t.phase[s.phase] ?? s.phase} · {t.players(s.playerCount)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/host/${s.id}`}
                  className="rounded-lg border border-[#352E47] bg-[#1A1626] px-3 py-1.5 text-sm text-[#F2EFE6]"
                >
                  {t.open}
                </Link>
                <button
                  onClick={() => onDelete(s)}
                  disabled={deletingId === s.id}
                  className="rounded-lg border border-[#8B3A3A]/40 px-3 py-1.5 text-sm text-[#C46A6A] disabled:opacity-50"
                >
                  {deletingId === s.id ? t.deleting : t.delete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
