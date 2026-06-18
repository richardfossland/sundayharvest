import { cn } from '@/lib/cn'

// Five wheat-sheaf tiles. Resolved works turn golden (fruit) or wither to
// blight (choked). The signature visual element of SundayHarvest.
export function WorkTrack({
  results,
  current,
  twoWeedWork,
  large = false,
}: {
  // results[i]: true = fruit, false = choked, undefined = not played yet
  results: (boolean | undefined)[]
  current?: number // 1-based work index currently in play
  twoWeedWork?: number // 1-based index of the two-weed work, if any
  large?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-center gap-2', large ? 'gap-4' : 'gap-2')}>
      {[0, 1, 2, 3, 4].map((i) => {
        const r = results[i]
        const isCurrent = current === i + 1
        const isTwoWeed = twoWeedWork === i + 1
        return (
          <div
            key={i}
            className={cn(
              'relative flex items-center justify-center rounded-xl border-2 transition-colors',
              large ? 'h-20 w-20 text-3xl' : 'h-11 w-11 text-lg',
              r === true && 'border-sage bg-sage/25',
              r === false && 'border-blight bg-blight/25',
              r === undefined && 'border-border bg-surface',
              isCurrent && r === undefined && 'border-gold animate-pulse-gold'
            )}
            title={isTwoWeed ? 'Krever to ugress for å feile' : undefined}
          >
            <span aria-hidden>{r === true ? '🌾' : r === false ? '🥀' : i + 1}</span>
            {isTwoWeed && (
              <span
                className={cn(
                  'absolute -top-1 -right-1 rounded-full bg-border px-1 text-muted',
                  large ? 'text-xs' : 'text-[9px]'
                )}
              >
                ×2
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Reject counter — five dots that climb toward abandonment.
export function RejectDots({ count, large = false }: { count: number; large?: boolean }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`${count} av 5 avvisninger`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            'rounded-full transition-colors',
            large ? 'h-3 w-3' : 'h-2 w-2',
            i < count ? 'bg-blight' : 'bg-border'
          )}
        />
      ))}
    </div>
  )
}
