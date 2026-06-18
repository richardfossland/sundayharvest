// Route-level loading fallback — a quiet branded screen on the night field
// while a route segment streams in, instead of a blank flash.
export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="animate-sway inline-block text-5xl" aria-hidden>
        🌾
      </div>
      <div
        className="animate-spin-slow h-6 w-6 rounded-full border-[3px] border-border border-t-gold"
        role="status"
        aria-label="Laster"
      />
    </main>
  )
}
