// Norwegian strings for the OPTIONAL Sunday Account host login + "Mine økter"
// dashboard. The signed-in host is the VERT; players/joiners/displays stay fully
// code-based (no account needed). Kept in one place so the host surface reads
// consistently; the rest of the app keeps its inline strings.

export const hostStrings = {
  // login
  loginTitle: 'Logg inn som vert',
  loginLead:
    'Logg inn med Sunday-kontoen din for å se og styre øktene dine. Deltakere trenger ingen konto — de blir med med spillkode.',
  emailLabel: 'E-post',
  emailPlaceholder: 'deg@menigheten.no',
  sendMagicLink: 'Send innloggingslenke',
  sending: 'Sender …',
  magicLinkSent: (email: string) =>
    `Sjekk innboksen til ${email} — vi har sendt deg en innloggingslenke.`,
  google: 'Logg inn med Sunday-konto',
  or: 'eller',
  sendError: 'Klarte ikke å sende lenken — sjekk adressen og prøv igjen.',
  authError: 'Innloggingen feilet. Prøv igjen.',
  backToPlay: 'Tilbake til forsiden',

  // dashboard
  dashTitle: 'Øktene mine',
  dashLead: 'Spill du har laget mens du var innlogget.',
  signedInAs: (email: string) => `Innlogget som ${email}`,
  signOut: 'Logg ut',
  createNew: 'Opprett ny økt',
  creating: 'Oppretter …',
  createError: 'Klarte ikke å opprette økt. Prøv igjen.',
  empty: 'Du har ingen lagrede økter ennå. Opprett én for å komme i gang.',
  open: 'Åpne',
  delete: 'Slett',
  deleting: 'Sletter …',
  confirmDelete: (code: string) =>
    `Slette økt «${code}»? Dette kan ikke angres — alle spillere, roller og hendelser slettes.`,
  deleteError: 'Klarte ikke å slette økten. Prøv igjen.',
  codeLabel: 'Kode',
  players: (n: number) => `${n} ${n === 1 ? 'spiller' : 'spillere'}`,

  // phases (mirrors the host panel's PhaseLabel + lobby/ended)
  phase: {
    lobby: 'Lobby',
    role_reveal: 'Rolleutdeling',
    work_proposal: 'Forslag',
    work_vote: 'Avstemning',
    work_execution: 'Gjerning pågår',
    judas_phase: 'Judas reiser seg',
    ended: 'Avsluttet',
  } as Record<string, string>,

  // landing link
  hostLink: 'Er du vert? Logg inn med Sunday-konto',
}
