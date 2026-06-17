// ── AI debrief — PURE prompt builder ─────────────────────────────────────────
// No network, no env, no Date.now: deterministic given its input so it can be
// unit-tested with canned fixtures. Builds the Anthropic Messages request body
// for an anonymized game state. The system prompt is tightly scoped: Norwegian,
// church/youth-group appropriate, grounded in Matt 13:24-30, fixed JSON shape.

import { ROLES } from '@/lib/config'
import {
  AnthropicMessagesRequest,
  ANTHROPIC_MODEL,
  DebriefGameState,
} from './types'

const SYSTEM_PROMPT = `Du er en varsom samtaleleder for en kristen ungdomsgruppe i Norge (bedehus/menighet).
Gruppen har nettopp spilt et sosialt deduksjonsspill bygd på lignelsen om hveten og ugresset (Matteus 13:24-30): tjenerne vil luke ut ugresset med en gang, men herren sier «La begge vokse sammen til høsten» — for vi kan ikke se hjertene, det kan bare Gud. I spillet er roller på liksom; ingen er egentlig «ugress». Saulus kan omvende seg (Apg 9); Judas kan ikke (Matt 27).

Oppgaven din: lag en KORT andakt og 2-3 samtalespørsmål som passer for ungdom, forankret i denne lignelsen og det spillet gruppen nettopp opplevde.

Regler du MÅ følge:
- Skriv på enkel, varm norsk (bokmål). Ungdomsvennlig, ikke barnslig, ikke akademisk.
- Hold deg til lignelsen om hveten og ugresset og de nære bibelstedene (Matt 13, Matt 27, Apg 9, 1 Sam 16:7, Joh 15:8). Ikke dikt opp bibelvers eller referanser.
- Andakten skal være 2-4 setninger. Ingen overskrift, ingen «Andakt:»-prefiks.
- Spørsmålene skal være åpne, ikke ja/nei. Knytt dem til det gruppen opplevde i spillet.
- Vær trygg, inkluderende og ikke fordømmende. Ingen utpeking av enkeltpersoner.
- IKKE bruk navn — du får uansett ingen.
- Svar KUN med gyldig JSON på nøyaktig denne formen, uten markdown-kodeblokk:
{"andakt": "...", "questions": ["...", "..."]}`

function describeOutcome(g: DebriefGameState): string {
  const lines: string[] = []
  lines.push(
    g.outcome === 'faithful_win'
      ? 'Flokken (de trofaste) vant.'
      : 'Forræderne vant.'
  )
  lines.push(`Av fem gjerninger bar ${g.fruitWorks} frukt og ${g.chokedWorks} visnet.`)
  lines.push(`Antall spillere: ${g.playerCount}.`)
  if (g.judasWon) {
    lines.push('Forræderne vant fordi Judas til slutt pekte ut Profeten.')
  }
  if (g.saulusConverted) {
    lines.push('En Saulus-spiller omvendte seg underveis og ble trofast.')
  }
  const roleLabels = Array.from(new Set(g.rolesInPlay))
    .map((r) => ROLES[r]?.label)
    .filter(Boolean)
  if (roleLabels.length) {
    lines.push(`Roller i spill (uten kobling til personer): ${roleLabels.join(', ')}.`)
  }
  return lines.join(' ')
}

/**
 * Build the Messages-API request body for a debrief. PURE: same input →
 * same output. `variant: 'more'` asks for a fresh set distinct from earlier.
 */
export function buildDebriefRequest(
  game: DebriefGameState,
  variant: 'initial' | 'more' = 'initial'
): AnthropicMessagesRequest {
  const summary = describeOutcome(game)
  const ask =
    variant === 'more'
      ? 'Gruppen ønsker FLERE spørsmål. Lag en ny, kort andakt og 2-3 HELT NYE samtalespørsmål som ikke gjentar de typiske åpenbare spørsmålene. Vinkle annerledes enn et standard opplegg.'
      : 'Lag andakten og 2-3 samtalespørsmål nå.'

  return {
    model: ANTHROPIC_MODEL,
    max_tokens: 700,
    temperature: variant === 'more' ? 0.9 : 0.7,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Slik gikk runden:\n${summary}\n\n${ask}`,
      },
    ],
  }
}

// Exported only so tests can assert the prompt is grounded + name-free.
export const DEBRIEF_SYSTEM_PROMPT = SYSTEM_PROMPT
