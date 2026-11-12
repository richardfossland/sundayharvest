import Link from 'next/link'

import { hostStrings as t } from '@/lib/locale/host'

/** Shown on the host-login surface when Sunday Account host SSO is not set up. */
export function HostLoginDisabled() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      <div className="animate-fade-in w-full text-center">
        <div className="mb-2 inline-block text-5xl" aria-hidden>
          🌾
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[#E3B23C]">
          SundayHarvest
        </h1>
        <h2 className="mt-3 font-display text-xl text-[#F2EFE6]">{t.loginDisabledTitle}</h2>
        <p className="mt-2 text-sm text-[#9A92A8]">{t.loginDisabledLead}</p>
        <div className="mt-8">
          <Link href="/" className="text-sm text-[#9A92A8] hover:text-[#F2EFE6]">
            {t.backToPlay}
          </Link>
        </div>
      </div>
    </main>
  )
}
