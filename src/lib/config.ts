import { RoleId, Team } from '@/types/game'

// ── Balance tables (from balanced Avalon — do not adjust the numbers) ────────
export const TEAM_SIZES: Record<number, number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
}
export const BETRAYER_COUNT: Record<number, number> = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 }

// For 7+ players the FOURTH work needs two Ugress cards to fail.
export const TWO_WEED_WORKS: Record<number, number[]> = {
  5: [], 6: [], 7: [4], 8: [4], 9: [4], 10: [4],
}

export const MIN_PLAYERS = 5
export const MAX_PLAYERS = 10 // config tables stop at 10; UI caps here.

export interface RoleMeta {
  id: RoleId
  team: Team
  label: string
  emoji: string
  blurb: string
  verse: string
}

// Verse choices corrected per PLAN-AMENDMENTS §C-2:
//   prophet  → 2 Kong 6:17 (Elisja ser det skjulte) rather than 1 Sam 16:7,
//              which is the verse where the prophet CANNOT see by his own sight.
//   shepherd → Esek 33:7 (vekteren) rather than Joh 10:14, whose "gode hyrden"
//              is Christ's own "Jeg er"-utsagn. Internal id stays `shepherd`.
export const ROLES: Record<RoleId, RoleMeta> = {
  disciple: {
    id: 'disciple', team: 'faithful', label: 'Disippel', emoji: '🕊️',
    blurb: 'Du er trofast. Du ser ingenting skjult — bare hjertet ditt og dømmekraften din.',
    verse: 'Lukas 10',
  },
  prophet: {
    id: 'prophet', team: 'faithful', label: 'Profeten', emoji: '👁️',
    blurb: 'Du ser forrædernes hjerter — men Slangen er skjult for deg. Led flokken uten å avsløre deg selv, ellers finner Judas deg.',
    verse: '2. Kongebok 6:17',
  },
  shepherd: {
    id: 'shepherd', team: 'faithful', label: 'Vekteren', emoji: '🛡️',
    blurb: 'Du ser to skikkelser: den sanne Profeten og den falske. Finn ut hvem som er ekte, og vokt ham.',
    verse: 'Esekiel 33:7',
  },
  barnabas: {
    id: 'barnabas', team: 'faithful', label: 'Barnabas', emoji: '🔥',
    blurb: 'Din stemme teller dobbelt i hver avstemning. Oppmuntringens sønn — du svinger flokken. Men de vil merke det.',
    verse: 'Apg 4:36',
  },
  minion: {
    id: 'minion', team: 'betrayer', label: 'Forræder', emoji: '🌾',
    blurb: 'Du er ugresset blant hveten. Spill Ugress for å kvele gjerningene — uten å bli oppdaget.',
    verse: 'Matteus 13:25',
  },
  false_prophet: {
    id: 'false_prophet', team: 'betrayer', label: 'Den falske profeten', emoji: '🎭',
    blurb: 'For Vekteren ser du ut som en profet. Bruk forvirringen. Du er en forræder.',
    verse: '2. Korinter 11:14',
  },
  serpent: {
    id: 'serpent', team: 'betrayer', label: 'Slangen', emoji: '🐍',
    blurb: 'Profeten kan ikke se deg. Du er den farligste forræderen — listigere enn alle.',
    verse: '1. Mosebok 3:1',
  },
  judas: {
    id: 'judas', team: 'betrayer', label: 'Judas', emoji: '🪙',
    blurb: 'Du er en forræder. Hvis flokken vinner gjerningene, får du ett siste forsøk: pek ut Profeten.',
    verse: 'Matteus 26',
  },
  saulus: {
    id: 'saulus', team: 'betrayer', label: 'Saulus', emoji: '⚡',
    blurb: 'Du starter som forræder. Én gang kan du omvende deg og bli trofast — men da blir du blindet for de andre forræderne.',
    verse: 'Apg 9',
  },
}

export const BETRAYER_ROLES: RoleId[] = ['minion', 'false_prophet', 'serpent', 'judas', 'saulus']

export function teamOf(role: RoleId): Team {
  return BETRAYER_ROLES.includes(role) ? 'betrayer' : 'faithful'
}
