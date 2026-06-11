import { Session } from '@/types/game'
import { WorkTrack, RejectDots } from './WorkTrack'
import { TWO_WEED_WORKS } from '@/lib/config'

// Builds the fruit/choked results array from the session counters. We can't know
// the exact per-index order from counts alone, so we render fruit tiles first,
// then choked, then the current/upcoming — which matches the running tally.
export function workResults(s: Session): (boolean | undefined)[] {
  const out: (boolean | undefined)[] = []
  for (let i = 0; i < s.fruit_works; i++) out.push(true)
  for (let i = 0; i < s.choked_works; i++) out.push(false)
  while (out.length < 5) out.push(undefined)
  return out
}

export function PhaseBar({ session, leaderName }: { session: Session; leaderName?: string }) {
  const twoWeed = (TWO_WEED_WORKS[session.player_count] ?? [])[0]
  return (
    <div className="border-b border-[#352E47] bg-[#262035]/60 px-4 py-3">
      <div className="mx-auto flex max-w-md flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-display text-[#E3B23C]">
            Gjerning {session.current_work}/5
          </span>
          {leaderName && (
            <span className="text-[#9A92A8]">
              Eldste: <span className="text-[#F2EFE6]">{leaderName}</span>
            </span>
          )}
        </div>
        <WorkTrack
          results={workResults(session)}
          current={session.current_work}
          twoWeedWork={twoWeed}
        />
        <div className="flex items-center justify-between text-xs text-[#9A92A8]">
          <span>Avvisninger</span>
          <RejectDots count={session.reject_count} />
        </div>
      </div>
    </div>
  )
}
