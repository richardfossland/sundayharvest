'use client'

import { Button } from '@/components/ui/Button'

// Route-level error boundary — a transient render/runtime error shows a friendly
// recovery screen instead of a blank, unrecoverable page.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-5xl" aria-hidden>
        🥀
      </div>
      <div>
        <h1 className="font-display text-3xl font-semibold text-gold">Noe gikk galt</h1>
        <p className="mt-2 text-sm text-muted">
          Prøv på nytt — spillet kjører trygt videre på serveren.
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => reset()}>Prøv igjen</Button>
        <Button variant="ghost" onClick={() => (window.location.href = '/')}>
          Til forsiden
        </Button>
      </div>
    </main>
  )
}
