# SundayHarvest 🌾

Et bibelsk social-deduction-spill for ungdomsgrupper — bygd på *The Resistance:
Avalon*-motoren, reskinnet rundt **lignelsen om hveten og ugresset** (Matt
13:24–30) og av-letalisert: **ingen blir slått ut.** Del av SundaySuite, lander
på `harvest.sundaysuite.app`.

5–10 spillere. Telefonen deler ut hemmelige roller, leverer privat kunnskap til
hver spillers egen skjerm, og driver storskjermen. Du dømmer **gjerninger, ikke
hjerter** — for i lignelsen får ingen luke ut ugresset; det gjør Gud ved høsten.

## Stack

- Next.js 16 (App Router, TypeScript) · Tailwind v4
- Supabase (Postgres + Realtime + SECURITY DEFINER RPC-er)
- Cloudflare Workers via OpenNext (som resten av SundaySuite)

## Oppsett

```bash
npm install
cp .env.local.example .env.local   # fyll inn delt-prosjekt URL + anon key
npm run dev                        # spilltest med 5 faner på samme kode
```

### Database

Spillet lever i et eget **`harvest`**-schema i det **delte** SundaySuite-
Supabase-prosjektet (samme som Chess/Market/Turnering/Quiz — gratis-takets
2-prosjekt-grense).

1. Kjør `supabase/migrations/0001_harvest_schema.sql` i SQL-editoren.
2. **Settings → API → Exposed schemas → legg til `harvest` → Save.**
   Uten dette router ikke PostgREST `harvest.*`-kall, og create/join feiler.

## Sikkerhetsmodell

Ingen brukerautentisering. Hemmelighold håndheves server-side:

- Offentlige tabeller (`sessions`, `players`, `events`) har åpen RLS og ligger
  på realtime.
- **Hemmeligheter** (`player_roles`, `work_plays`) og `votes` er låst — kun
  nåbare via `SECURITY DEFINER`-RPC-er.
- Hver spiller får en **hemmelig token** (`join_session` returnerer den én
  gang, lagres i `localStorage`). Hver spiller-RPC krever den — å kjenne en
  annens offentlige UUID er ikke nok til å lese rollen deres.
- Stemmer avsløres kun samtidig, via `resolve_vote`-eventets payload (ligger
  ikke på realtime, så de lekker ikke før avsløring).

## Deploy

```bash
npm run cf:deploy
```

Sett `harvest.sundaysuite.app` som custom domain i Cloudflare (CNAME), og legg
`NEXT_PUBLIC_*` som build-env før `cf:build`.

## Design-/teologi-noter

Rettelses-pakken `PLAN-AMENDMENTS.md` dokumenterer hvorfor enkelte vers og
mekanikker avviker fra den opprinnelige planen (hemmelighold-fiks, debrief-lag,
to-lignelser-presisjon, vers-bytter på Profeten/Vekteren). Les den før endringer
i rollene eller sluttskjermen.
