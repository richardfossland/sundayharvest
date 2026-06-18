'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { createAuthBrowserClient } from '@/lib/supabase/auth-browser'
import { hostStrings as t } from '@/lib/locale/host'

function HostLoginInner() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const params = useSearchParams()
  const authError = params.get('error') === 'auth'

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const supabase = createAuthBrowserClient()
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) throw error
      setSent(true)
    } catch {
      setError(t.sendError)
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    const supabase = createAuthBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      <div className="animate-fade-in w-full">
        <div className="mb-8 text-center">
          <div className="mb-2 inline-block animate-sway text-5xl" aria-hidden>
            🌾
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#E3B23C]">
            SundayHarvest
          </h1>
          <h2 className="mt-3 font-display text-xl text-[#F2EFE6]">{t.loginTitle}</h2>
          <p className="mt-2 text-sm text-[#9A92A8]">{t.loginLead}</p>
        </div>

        {(error || authError) && (
          <p className="mb-4 text-center text-sm text-[#8B3A3A]">
            {error ?? t.authError}
          </p>
        )}

        <div className="rounded-2xl border border-[#352E47] bg-[#262035] p-5">
          {sent ? (
            <p className="text-sm text-[#F2EFE6]">{t.magicLinkSent(email)}</p>
          ) : (
            <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
              <label className="text-xs uppercase tracking-wide text-[#9A92A8]" htmlFor="email">
                {t.emailLabel}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.emailPlaceholder}
                autoComplete="email"
                className="rounded-xl border border-[#352E47] bg-[#1A1626] px-4 py-3 text-[#F2EFE6] placeholder:text-[#9A92A8] focus:border-[#E3B23C] focus:outline-none"
              />
              <button
                disabled={busy}
                className="rounded-xl bg-[#6B8F5E] py-3 font-medium text-[#1A1626] transition-opacity disabled:opacity-50"
              >
                {busy ? t.sending : t.sendMagicLink}
              </button>
            </form>
          )}
        </div>

        <div className="my-4 text-center text-xs text-[#9A92A8]">{t.or}</div>

        <button
          onClick={signInWithGoogle}
          className="w-full rounded-xl border border-[#352E47] bg-[#262035] py-3 font-medium text-[#F2EFE6] transition-colors hover:border-[#E3B23C]"
        >
          {t.google}
        </button>

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm text-[#9A92A8] hover:text-[#F2EFE6]">
            {t.backToPlay}
          </Link>
        </div>
      </div>
    </main>
  )
}

export default function HostLoginPage() {
  return (
    <Suspense fallback={null}>
      <HostLoginInner />
    </Suspense>
  )
}
