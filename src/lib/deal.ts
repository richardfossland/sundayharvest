import { RoleId, Player } from '@/types/game'
import { BETRAYER_COUNT, BETRAYER_ROLES, teamOf } from './config'

export interface DeckToggles {
  useShepherd: boolean
  useSerpent: boolean
  useSaulus: boolean
  useBarnabas: boolean
}

/**
 * Build a legal role list for the player count + toggles.
 * Invariants (PLAN role-picker rules):
 *  - exactly BETRAYER_COUNT[n] betrayers, n − that faithful
 *  - Profeten always present, Judas always present
 *  - Shepherd ⇔ False Prophet (both or neither)
 *  - Serpent / Saulus / minion fill remaining betrayer slots
 *  - Barnabas / Disippel fill remaining faithful slots
 */
export function buildRoleList(n: number, t: DeckToggles): RoleId[] {
  const betrayers = BETRAYER_COUNT[n]
  const faithful = n - betrayers

  const fr: RoleId[] = ['prophet']
  const wantShepherd = t.useShepherd && faithful >= 2 && betrayers >= 2
  if (wantShepherd) fr.push('shepherd')
  if (t.useBarnabas && fr.length < faithful) fr.push('barnabas')
  while (fr.length < faithful) fr.push('disciple')

  const br: RoleId[] = ['judas']
  if (wantShepherd) br.push('false_prophet')
  if (t.useSerpent && br.length < betrayers) br.push('serpent')
  if (t.useSaulus && br.length < betrayers) br.push('saulus')
  while (br.length < betrayers) br.push('minion')

  return [...fr, ...br] // length === n
}

export function shuffle<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

/**
 * Compute each player's known_player_ids (evaluated at deal time):
 *  - all betrayers see each other
 *  - Prophet sees betrayers EXCEPT the Serpent
 *  - Shepherd sees Prophet + False Prophet, shuffled, unlabelled
 *  - Disciple / Barnabas see nothing
 */
export function deriveKnowledge(
  players: Player[],
  roleOf: Record<string, RoleId>
): Record<string, string[]> {
  const role = (id: string) => roleOf[id]
  const betrayers = players.filter((p) => teamOf(role(p.id)) === 'betrayer')
  const out: Record<string, string[]> = {}
  for (const p of players) {
    if (teamOf(role(p.id)) === 'betrayer') {
      out[p.id] = betrayers.filter((b) => b.id !== p.id).map((b) => b.id)
    } else if (role(p.id) === 'prophet') {
      out[p.id] = betrayers.filter((b) => role(b.id) !== 'serpent').map((b) => b.id)
    } else if (role(p.id) === 'shepherd') {
      const figures = players
        .filter((x) => role(x.id) === 'prophet' || role(x.id) === 'false_prophet')
        .map((x) => x.id)
      out[p.id] = shuffle(figures)
    } else {
      out[p.id] = []
    }
  }
  return out
}

export interface Assignment {
  player_id: string
  role: RoleId
  team: 'faithful' | 'betrayer'
  known_player_ids: string[]
}

/** Host flow: assemble assignments to pass to commit_deal. */
export function dealAssignments(players: Player[], roles: RoleId[]): Assignment[] {
  const order = shuffle(players)
  const roleOf: Record<string, RoleId> = {}
  order.forEach((p, i) => {
    roleOf[p.id] = roles[i]
  })
  const known = deriveKnowledge(players, roleOf)
  return players.map((p) => ({
    player_id: p.id,
    role: roleOf[p.id],
    team: BETRAYER_ROLES.includes(roleOf[p.id]) ? 'betrayer' : 'faithful',
    known_player_ids: known[p.id],
  }))
}
