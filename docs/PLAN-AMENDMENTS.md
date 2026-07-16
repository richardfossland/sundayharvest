# SundayHarvest — rettelser til planen

Dette dokumentet **endrer** den opprinnelige planen. Der dette motsier
hovedplanen, gjelder dette. Alt annet i hovedplanen står ved lag.

Tre må-fikser (A–C) før bygging, så mindre tekniske rettelser (D–I), så
suite-tilpasning (J). Teologisk begrunnelse står i avsnitt 0 og i debrief-
innholdet (B).

---

## 0. Teologisk ramme — det spillet faktisk lærer

Lignelsen om hvete og ugress (Matt 13:24–30) har **ett** hovedpoeng, og det
er ikke «lær å luke ut de onde». Tjenerne vil luke; herren sier nei — *«når
dere samler ugresset, rykker dere opp hveten samtidig»* (v.29). Sorteringen
tilhører Gud ved høsten, ikke oss nå.

Spillet må derfor aldri presentere seg som «gjennomskue og fjern forræderne».
To ting holder det teologisk ærlig, og begge skal være eksplisitte i copy:

1. **Ingen elimineres — alle vokser sammen til slutten.** Dette ER lignelsens
   poeng. Selg det som teologi, ikke bare som spillbalanse.
2. **Man dømmer gjerninger, ikke hjerter.** Spillerne avgjør hvilke *lag* de
   stoler på. Rollene er fiksjon; ingen ekte person stemples som frelst eller
   fortapt. Den dommen er Guds (1 Sam 16:7 — *Herren* ser hjertet).

Forløsningen (Saulus → Paulus, Apg 9) er en egen tråd, ikke en del av hvete/
ugress-ontologien (der blir aldri ugress til hvete). Ram den slik: *selv den
som ser ut som ugress, kjenner Gud hjertet til* — ikke som «et ugress ble
hvete».

---

## A. KRITISK: hemmelighold er brutt slik planen står

**Problem.** `get_my_role(p_player_id)` tar bare en spiller-UUID og er
`grant … to anon`. Men UUID-ene er ikke hemmelige: `players` har
`policy using(true)` og publiseres på realtime. Hvem som helst kan hente alle
`players.id` og kalle `get_my_role` på hver av dem → **hele rollelisten lekker**.
Samme gjelder `convert_saul`, `submit_card`, `judas_strike` (handlinger på
vegne av andre). Dette gjør det teologiske løftet om «perfekt privat
åpenbaring» falskt.

**Fiks — per-spiller hemmelighet som ikke ligger i den offentlige tabellen.**

Hemmeligheten lever i en egen, låst tabell, returneres **én gang** ved join,
lagres i `localStorage` (`harvest_secret`), og kreves av hver spiller-scoped RPC.

```sql
-- Egen, låst hemmelighetstabell (IKKE i players, IKKE i realtime)
create table public.player_secrets (
  player_id uuid primary key references public.players(id) on delete cascade,
  secret    text not null default encode(gen_random_bytes(24), 'hex')
);
alter table public.player_secrets enable row level security;
revoke all on public.player_secrets from anon, authenticated;
-- ingen policy => ingen direkte tilgang; kun via definer-RPC nedenfor

-- Join-RPC: oppretter spiller + hemmelighet atomisk, returnerer hemmeligheten ÉN gang.
create or replace function join_session(p_code text, p_name text)
returns jsonb language plpgsql security definer as $$
declare s record; pid uuid; sec text; next_seat int;
begin
  select * into s from public.sessions where code = upper(p_code);
  if s is null then return jsonb_build_object('ok', false, 'error', 'Ukjent kode'); end if;
  if s.phase <> 'lobby' then return jsonb_build_object('ok', false, 'error', 'Spillet er allerede i gang'); end if;
  select coalesce(max(seat) + 1, 0) into next_seat from public.players where session_id = s.id;
  insert into public.players (session_id, name, seat) values (s.id, p_name, next_seat) returning id into pid;
  insert into public.player_secrets (player_id) values (pid) returning secret into sec;
  return jsonb_build_object('ok', true, 'player_id', pid, 'session_id', s.id, 'seat', next_seat, 'secret', sec);
end; $$;

-- Hjelpeverifisering brukt av alle spiller-scoped RPC-er.
create or replace function _verify(p_player_id uuid, p_secret text)
returns boolean language sql security definer as $$
  select exists (select 1 from public.player_secrets where player_id = p_player_id and secret = p_secret);
$$;
```

**Endre signaturen på alle spiller-scoped RPC-er** til å ta `p_secret` og
avvise hvis `_verify` feiler. Eksempel for `get_my_role`:

```sql
create or replace function get_my_role(p_player_id uuid, p_secret text)
returns jsonb language plpgsql security definer as $$
declare r record; names jsonb;
begin
  if not _verify(p_player_id, p_secret) then return null; end if;
  select * into r from public.player_roles where player_id = p_player_id;
  if r is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)), '[]')
    into names from public.players p where p.id = any(r.known_player_ids);
  return jsonb_build_object('role', r.role, 'team', r.team, 'converted', r.converted,
    'converted_on_work', r.converted_on_work, 'known', names);
end; $$;
```

Gjør tilsvarende for `convert_saul(p_player_id, p_secret)`,
`submit_card(p_player_id, p_secret, p_card)` og
`judas_strike(p_session_id, p_player_id, p_secret, p_target_id)`. Verts-gatede
RPC-er (`commit_deal`, `resolve_vote`, `resolve_work`) beholder `host_id`-sjekken.

Landingssiden bruker `join_session`-RPC i stedet for direkte INSERT, og lagrer
`player_id`/`session_id`/`secret` i `localStorage`.

---

## B. Debrief-/refleksjonslag (det egentlig manglende — påkrevd)

Planen er ren mekanikk. For et spill hvis premiss er «temaet ER mekanikken»
mangler hele refleksjonen. Legg til en **debrief-seksjon på sluttskjermen**
(`EndScreen.tsx`) og en kort **lederguide** på vertspanelet.

Sluttskjerm-debrief (norsk copy, vises etter rolle-tabellen):

> **Hva handlet dette egentlig om?**
>
> I lignelsen vil tjenerne luke ut ugresset med en gang. Herren sier nei: *«La
> begge vokse sammen til høsten»* (Matt 13:30). Hvorfor? Fordi vi ikke kan se
> hjertene — det kan bare Gud (1 Sam 16:7). Rollene i kveld var på liksom.
> Ingen her er egentlig «ugress».
>
> **Saulus og Judas** var begge forrædere. Den ene omvendte seg; den andre
> fortvilte (Matt 27:3–5). Nåden var åpen for begge — også for Judas.
> Spørsmålet er aldri «hvem er for langt borte til å bli reddet», men «vil jeg
> snu».

Tre debrief-spørsmål lederen kan ta muntlig (vis på projektor):
1. Var det vanskelig å ikke vite hvem du kunne stole på? Slik er det å leve
   «sammen til høsten» uten å få sortere.
2. Saulus ga opp seieren *og* synet for å bli trofast. Hva koster det å snu på
   ordentlig?
3. Kunne Judas ha omvendt seg? Hva sier det om nåde?

Sluttvers (erstatter Matt 13:30 — se rettelse C-3):
- Trofast seier: **Joh 15:8** — *«Ved dette blir min Far æret, at dere bærer
  mye frukt.»*
- Forræder-seier: **Gal 6:9** — *«La oss ikke bli trette mens vi gjør det
  gode.»* (Unngå doms-/brenningsbilder mot vennene i rommet.)

---

## C. Teologiske presisjonsrettelser

**C-1. To lignelser blandes.** «Kvalt av ugress» er språk fra *såmannen*
(Matt 13:22, tornene kveler ordet), en annen lignelse enn ugresset i åkeren
(13:24–30), der ugresset bare vokser ved siden av. Bytt UI-strengen:
- «Gjerningen ble kvalt av ugress 🥀» → **«Gjerningen visnet blant ugresset 🥀»**

**C-2. Vers-bytter på to roller** (`config.ts` → `ROLES`):

| Rolle | Fra | Til | Hvorfor |
|---|---|---|---|
| Profeten | 1 Sam 16:7 | **2 Kong 6:17** («Herre, åpne hans øyne så han kan se») | 1 Sam 16:7 er nettopp verset der profeten *ikke* ser med eget blikk; det er Gud som ser hjertet. Elisja som ser det skjulte passer maktens funksjon. |
| Hyrden | Joh 10:14 | **Esek 33:6–7** (vekteren) | «Den gode hyrden» er Kristi «Jeg er»-utsagn; å gi en spiller den tittelen er kristologisk skjevt. Vekter/vokter passer rollen «vern den sanne». |

Konkret diff i `config.ts`:
```typescript
prophet:  { …, verse:'2. Kongebok 6:17' },
shepherd: { …, label:'Vekteren',  // vurder å døpe om fra «Hyrden»
  blurb:'Du ser to skikkelser: den sanne Profeten og den falske. Finn ut hvem som er ekte, og vokt ham.',
  verse:'Esekiel 33:7' },
```
(Behold gjerne det interne id-et `shepherd` for å unngå kode-churn; bare
synlig label/vers endres. 1 Sam 16:7 kan i stedet siteres i debriefen, der
det hører hjemme.)

**C-3. Sluttvers** — se B. Ikke bruk Matt 13:30 (brenning av ugress);
det motsier spillets egen forløsningsmekanikk og er feil tone.

**C-4. Judas-seier-copy.** Når forræderne vinner via Judas, ram det slik at
«seieren» er hul, ikke en ren triumf:
> *«Judas pekte ut Profeten — som han en gang pekte ut Mesteren med et kyss.
> Forræderne vant denne runden. Men husk hvordan det gikk med Judas (Matt 27).»*

---

## D. Avstemnings-flertall regnes mot feil nevner

`resolve_vote` teller `approve_weight > total_weight/2` kun over *avgitte*
stemmer. Planen sier «manglende stemme = Avvis», men koden setter ikke inn
avvis — ikke-stemmende faller bare ut av nevneren. Avalon krever flertall av
*hele* laget. Fiks: bruk full roster-vekt som nevner og tell fravær som avvis.

```sql
-- inne i resolve_vote, etter løkken som summerer approve_weight over avgitte stemmer:
-- total_weight skal være SUM over ALLE spillere (Barnabas ×2), ikke bare de som stemte.
select coalesce(sum(case when role='barnabas' then 2 else 1 end), 0)
  into total_weight
  from public.player_roles where session_id = p_session_id;
-- approve_weight beholdes fra løkken (kun 'approve'-stemmer). Manglende stemme
-- bidrar dermed til nevneren, men ikke til approve => teller som avvis.
if approve_weight > total_weight / 2.0 then …  -- streng flertallskrav
```

---

## E. Stemmer lekker over realtime (bryter «simultan avsløring»)

`votes` er i `supabase_realtime` + offentlig select → klienter ser hverandres
stemmer idet de legges inn, før den simultane avsløringen. Hvis simultanitet er
en feature (planen sier ja), må ikke `votes` eksponeres før `resolve_vote`.

- Fjern `votes` fra `supabase_realtime`-publikasjonen.
- Sett `policy "votes select"` til å kun returnere rader når
  `attempt < current_attempt` eller `phase` har passert `work_vote` for den
  attempten — eller enklere: returner stemmene som payload i `vote_result`-
  eventet (som allerede fyrer ved resolve), og la klienten rendre fra eventet.
- Innsetting av egen stemme skjer fortsatt direkte (eller via en liten
  `cast_vote(p_player_id, p_secret, value)`-RPC for konsistens med A).

---

## F. `get_work_counts` kan polles før avsløring

Den returnerer tellinger når som helst → en klient kan polle under execution og
se ugress dukke opp / tidsstemple sabotasje. Gate den:

```sql
-- returner kun tellinger når alle på laget har levert, ellers bare 'submitted'
-- (la klient/projektor vise «Gjerningen pågår…» til submitted = team-størrelse).
```
Eller eksponer tellinger utelukkende via `work_result`-eventet (som B/E),
og dropp den offentlige polle-veien.

---

## G. Lås joins etter deal + 5-avvis-regelen

- **Join kun i lobby.** `join_session` (avsnitt A) avviser allerede når
  `phase <> 'lobby'`. Da forblir seter/leder-rotasjon stabile.
- **5-avvis-regelen er ikke Avalon-balanse.** I ekte Avalon = ond side vinner
  *hele* spillet på 5. avvis. Din «ett kvalt verk» er et bevisst, mildere valg
  — bra, men ikke påstå at *denne* regelen er kopiert eksakt fra Avalon. Bare
  team-størrelser og forræder-antall er det.

---

## H. 12-spiller-inkonsistens

Introen sier «stretch to 12», men alle config-tabeller stopper på 10. Velg én:
- enten utvid `TEAM_SIZES` / `BETRAYER_COUNT` / `TWO_WEED_WORKS` til 11–12 med
  balanserte Avalon-tall, eller
- fjern «12» fra introen og kapp UI på 10.

Anbefaling: kapp på 10 i første build (tallene over 10 er ikke gitt i planen).

---

## I. Saulus etter omvendelse — Profetens stale liste (bekreftet OK)

Profetens `known_player_ids` settes ved deal og oppdateres ikke. Etter at
Saulus omvender seg, lister Profeten ham fortsatt som forræder. Planen lar dette
stå — **behold det**. Det er mekanisk korrekt (snapshot) og tematisk sant: en
ulv som ble sau. Ingen endring; nevnt her så det ikke «fikses» ved en feil.

---

## J. Suite-tilpasning (avviker fra resten av SundaySuite)

1. **Deploy: ikke Vercel.** SundayMarket, Quiz, Chess og Turnering kjører alle
   på **Cloudflare Worker via OpenNext**, og `*.sundaysuite.app` ligger på
   Cloudflare. `harvest.sundaysuite.app` skal følge samme mønster:
   `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy`, og
   CNAME via Cloudflare — ikke `cname.vercel-dns.com`. Erstatt «Build & deploy»-
   seksjonens steg 7 + Vercel-DNS-avsnittet tilsvarende.
2. **Delt Supabase-prosjekt + eget schema.** Resten av suiten deler *ett*
   Supabase-prosjekt (gratis-takets 2-prosjekt-grense) via egne schemaer
   (`market`, `quiz`, `turnering`). Ikke spinn opp et nytt prosjekt. Legg alle
   tabeller/RPC-er i et **`harvest`**-schema i det delte prosjektet, og eksponer
   `harvest`-schemaet i Settings → API. Bytt `public.` → `harvest.` gjennom hele
   schema-/RPC-SQL-en, og sett realtime-publikasjonen på `harvest`-tabellene.

---

## Rekkefølge for bygging

1. A (hemmelighold) + J-2 (harvest-schema) — fundamentet; alt annet bygger på
   riktig sikkerhets- og schema-grunnlag.
2. B + C (teologi/debrief/vers) — billig, og det er disse som gjør det til et
   *kristent* spill og ikke bare reskinnet Avalon.
3. D, E, F (avstemning/lekkasjer) — korrekthet i kjernesløyfen.
4. G, H, J-1 (joins, 12-spiller, CF-deploy) — opprydning før utrulling.
