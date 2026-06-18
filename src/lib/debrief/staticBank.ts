// Static debrief bank — the andakt + samtalespørsmål shown on the end screen
// when no AI key is configured (or the /api/debrief call fails). This is what
// every group actually sees today, so it carries the point of the game. The AI
// debrief layers ON TOP of whichever variant we pick here.
//
// One entry is chosen deterministically per game (hash of the session id), so a
// group that plays several rounds gets fresh framing each time. Every verse
// reference below is real and matches the game's parable palette (Matt 13:24-30,
// Matt 27, Apg 9, 1 Sam 16:7, Joh 15:8, Matt 7:16). Do not invent references.

export interface StaticDebriefEntry {
  id: string
  title: string
  /** 2 short andakt paragraphs (plain text). */
  paragraphs: string[]
  /** 2-3 open discussion questions, tied to what the group just experienced. */
  questions: string[]
  /** Closing verse line (rendered in italics). */
  verse: string
}

export const STATIC_DEBRIEFS: StaticDebriefEntry[] = [
  {
    id: 'vokse-til-hosten',
    title: 'Hva handlet dette egentlig om?',
    paragraphs: [
      'I lignelsen vil tjenerne luke ut ugresset med en gang. Herren sier nei: «La begge vokse sammen til høsten» (Matt 13:30). Ikke fordi ugresset er greit, men fordi vi ikke kan se hjertene godt nok til å sortere folk — vi ville reist opp hveten sammen med ugresset.',
      'I kveld måtte dere gjette, mistenke og ta sjanser uten å vite sikkert. Slik er det å leve sammen «til høsten»: vi får ikke fasiten med en gang, og vi blir kalt til tålmodighet i stedet for til å dømme.',
    ],
    questions: [
      'Hvor sikre var dere egentlig på hvem som var ugress? Hvor lett var det å ta feil?',
      'Hva er forskjellen på å være klok på folk og å dømme dem?',
      'Hvordan er det å leve i et fellesskap der vi ikke vet alt om hverandre?',
    ],
    verse: '«La begge vokse sammen til høsten.» — Matteus 13:30',
  },
  {
    id: 'bare-gud-ser-hjertet',
    title: 'Hvem kunne egentlig se hjertene?',
    paragraphs: [
      'Hele spillet handler om å lese folk: minespill, stemmer, hvem som nøler. Men ingen av dere kunne faktisk se inn i et annet menneskes hjerte — dere måtte gjette fra det ytre.',
      'Da Samuel skulle finne en konge, så han på den høyeste og sterkeste. Gud sa: «Mennesket ser på det ytre, men Herren ser på hjertet» (1 Sam 16:7). Det er en lettelse: vi slipper å være de som dømmer — og en utfordring: vi skal heller ikke late som vi vet mer om folk enn vi gjør.',
    ],
    questions: [
      'Hva fikk dere til å mistenke noen i kveld — og hvor ofte stemte det?',
      'Har du noen gang blitt feilbedømt på det ytre? Hvordan kjentes det?',
      'Hva betyr det at Gud ser hjertet, både for hvordan vi ser på oss selv og på andre?',
    ],
    verse: '«Herren ser på hjertet.» — 1. Samuelsbok 16:7',
  },
  {
    id: 'saulus-og-judas',
    title: 'To forrædere, to veier',
    paragraphs: [
      'Saulus og Judas var begge på forrædernes lag. Den ene snudde: Saulus møtte Jesus på veien til Damaskus og ble en helt annen (Apg 9). Den andre fortvilte: Judas angret, men gikk bort i mørket (Matt 27:3-5).',
      'Nåden var åpen for begge. Forskjellen var ikke hvor ille de hadde rotet det til, men om de lot seg snu. Spørsmålet i lignelsen er aldri «hvem er for langt borte til å bli reddet», men «vil jeg vende om».',
    ],
    questions: [
      'Hvis dere hadde en Saulus i kveld — hva fikk hen til å snu, og hvordan ble det tatt imot?',
      'Hvorfor tror dere Saulus klarte å vende om, mens Judas ga opp?',
      'Er det noen vi i praksis har skrevet av som «umulige»? Hva sier nåden til det?',
    ],
    verse: 'Nåden var åpen for begge — også for Judas.',
  },
  {
    id: 'bare-frukt',
    title: 'Poenget var aldri å ta ugresset',
    paragraphs: [
      'Det er lett å tro at vinnerne er de som avslører flest forrædere. Men i lignelsen er ikke målet å luke — målet er at åkeren skal bære frukt. Jakten på ugresset kan faktisk skade hveten.',
      'Jesus sier: «Ved dette blir min Far æret, at dere bærer mye frukt» (Joh 15:8). Et fellesskap kjennes ikke først og fremst på hvor flinke vi er til å finne feil hos hverandre, men på hva som vokser fram mellom oss.',
    ],
    questions: [
      'Brukte dere mest energi på å avsløre andre, eller på å få gjerningene til å bære frukt?',
      'Hva «bærer frukt» i en ungdomsgruppe eller en klasse — helt konkret?',
      'Kan iveren etter å finne ut hvem som er «feil» noen ganger ødelegge noe godt?',
    ],
    verse: '«At dere bærer mye frukt.» — Johannes 15:8',
  },
  {
    id: 'falske-profeter',
    title: 'Den falske profeten',
    paragraphs: [
      'Noen roller var laget for å lure: den falske profeten så ut akkurat som den ekte. Dere måtte bruke skjønn — uten å bli så mistenksomme at dere vendte dere mot alle.',
      'Jesus ber oss både være årvåkne og varsomme: «På fruktene skal dere kjenne dem» (Matt 7:16). Ikke på hvor overbevisende noen høres ut, men på hva som faktisk vokser fram over tid.',
    ],
    questions: [
      'Hvordan prøvde dere å skille den ekte fra den falske i kveld? Hva funket?',
      'Hva vil det si å være klok uten å bli mistenksom mot alle?',
      'Hvordan kan «på fruktene skal dere kjenne dem» hjelpe oss i virkeligheten, ikke bare i spillet?',
    ],
    verse: '«På fruktene skal dere kjenne dem.» — Matteus 7:16',
  },
  {
    id: 'tillit-i-fellesskapet',
    title: 'Å leve sammen uten å vite alt',
    paragraphs: [
      'Det vanskeligste i spillet var kanskje ikke å finne forræderne, men å bestemme seg for hvem du ville stole på når du ikke kunne vite sikkert. Hver runde var et lite valg: tro godt om noen, eller trekke deg unna.',
      'Lignelsen lar hvete og ugress stå side om side helt til høsten. Det betyr at vi er kalt til å leve sammen i et fellesskap der vi ikke har fasiten på hverandre — og likevel velger tillit, tålmodighet og raushet.',
    ],
    questions: [
      'Hvordan kjentes det å måtte stole på noen uten å være sikker?',
      'Hva skal til for at en gruppe blir et trygt sted å være, selv når vi er ulike?',
      'Hvem kan du vise litt ekstra tillit eller raushet til denne uka?',
    ],
    verse: '«La begge vokse sammen til høsten.» — Matteus 13:30',
  },
]

/**
 * Deterministic pick: same session id → same variant (so a re-render is stable),
 * different game → different framing. No Date/Math.random (keeps it pure).
 */
export function pickStaticDebrief(seed: string): StaticDebriefEntry {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  }
  return STATIC_DEBRIEFS[h % STATIC_DEBRIEFS.length]
}
