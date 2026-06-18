import Link from 'next/link'

// 404 — a stray path lands here instead of the raw Next.js default.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-5xl" aria-hidden>
        🌾
      </div>
      <div>
        <h1 className="font-display text-3xl font-semibold text-gold">Fant ikke siden</h1>
        <p className="mt-2 text-sm text-muted">
          Denne åkeren finnes ikke. Gå tilbake og bli med på nytt.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-gold-light"
      >
        Til forsiden
      </Link>
    </main>
  )
}
