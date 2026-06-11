// ── SundayHarvest domain types ───────────────────────────────────────────────
// Theme strings are Norwegian (Norwegian youth groups); code stays English.

export type Phase =
  | 'lobby'
  | 'role_reveal'
  | 'work_proposal'
  | 'work_vote'
  | 'work_execution'
  | 'judas_phase'
  | 'ended'

export type Team = 'faithful' | 'betrayer'

export type RoleId =
  | 'disciple' | 'prophet' | 'shepherd' | 'barnabas'              // faithful
  | 'minion'   | 'false_prophet' | 'serpent' | 'judas' | 'saulus' // betrayer (at deal time)

export type VoteValue = 'approve' | 'reject'
export type WorkCard = 'fruit' | 'weed'
export type Outcome = 'faithful_win' | 'betrayer_win' | null
export type EventType = 'conversion' | 'vote_result' | 'work_result'

// PUBLIC — readable by anyone in the session.
export interface Player {
  id: string
  session_id: string
  name: string
  seat: number              // join order; drives leader rotation + identity
  role_confirmed: boolean
  is_online: boolean
  created_at: string
}

// SECRET — never read directly; only via get_my_role(player_id, secret) RPC.
export interface PlayerRole {
  player_id: string
  session_id: string
  role: RoleId
  team: Team                // current team (changes if Saulus converts)
  known_player_ids: string[]
  converted: boolean
  converted_on_work: number | null
}

export interface Session {
  id: string
  code: string
  host_id: string
  phase: Phase
  player_count: number
  current_work: number
  current_attempt: number
  leader_seat: number
  reject_count: number
  fruit_works: number
  choked_works: number
  team_sizes: number[]
  proposed_team: string[]
  outcome: Outcome
  roster_config: Record<string, number>
  created_at: string
}

export interface Vote {
  id: string
  session_id: string
  work: number
  attempt: number
  player_id: string
  value: VoteValue
}

export interface WorkPlay {
  id: string
  session_id: string
  work: number
  player_id: string
  card: WorkCard
}

export interface GameEvent {
  id: string
  session_id: string
  type: EventType
  payload: Record<string, unknown>
  created_at: string
}

// Shape returned by get_my_role RPC.
export interface MyRole {
  role: RoleId
  team: Team
  converted: boolean
  converted_on_work: number | null
  known: { id: string; name: string }[]
}

// Shape returned by get_final_reveal RPC.
export interface RevealRow {
  name: string
  seat: number
  role: RoleId
  team: Team
  converted: boolean
  converted_on_work: number | null
}
