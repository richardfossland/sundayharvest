-- ============================================================================
-- SundayHarvest — database schema  (idempotent: safe to re-run)
--
-- Lives in a dedicated `harvest` Postgres schema so it can coexist with the
-- other SundaySuite apps (SundayChess/Market/Turnering/Quiz) in the SAME shared
-- Supabase project — respecting the free-tier 2-project limit.
--
-- Architecture: session-scoped, NO user auth. Public tables (sessions, players,
-- events) use OPEN RLS. ALL SECRETS — roles and work cards — live in LOCKED
-- tables reachable only through SECURITY DEFINER RPCs keyed on a per-player
-- `secret` (see player_secrets). Knowing a player's public UUID is NOT enough
-- to read their role: the secret never leaves the owning device.
--
-- ⚠️  AFTER running this migration you MUST add `harvest` to the project's
--     exposed schemas:  Dashboard → Settings → API → "Exposed schemas" → add
--     `harvest` → Save. Without that, PostgREST will not route harvest.* calls.
-- ============================================================================

create extension if not exists "pgcrypto";
create schema if not exists harvest;

-- ── SESSION STATE ───────────────────────────────────────────────────────────
create table if not exists harvest.sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id text not null,
  phase text not null default 'lobby'
    check (phase in ('lobby','role_reveal','work_proposal','work_vote',
                     'work_execution','judas_phase','ended')),
  player_count int not null default 0,
  current_work int not null default 1,
  current_attempt int not null default 1,
  leader_seat int not null default 0,
  reject_count int not null default 0,
  fruit_works int not null default 0,
  choked_works int not null default 0,
  team_sizes int[] not null default '{}',
  proposed_team uuid[] not null default '{}',
  outcome text check (outcome in ('faithful_win','betrayer_win')),
  roster_config jsonb not null default '{}',
  created_at timestamptz default now()
);

-- ── PUBLIC PLAYER INFO (no secrets) ─────────────────────────────────────────
create table if not exists harvest.players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references harvest.sessions(id) on delete cascade,
  name text not null,
  seat int not null,
  role_confirmed bool not null default false,
  is_online bool not null default true,
  created_at timestamptz default now()
);

-- ── PER-PLAYER SECRET (locked; never public, never in realtime) ─────────────
create table if not exists harvest.player_secrets (
  player_id uuid primary key references harvest.players(id) on delete cascade,
  secret text not null default encode(gen_random_bytes(24), 'hex')
);

-- ── SECRET ROLES (locked) ───────────────────────────────────────────────────
create table if not exists harvest.player_roles (
  player_id uuid primary key references harvest.players(id) on delete cascade,
  session_id uuid references harvest.sessions(id) on delete cascade,
  role text not null,
  team text not null,
  known_player_ids uuid[] not null default '{}',
  converted bool not null default false,
  converted_on_work int
);

-- ── VOTES (revealed only at resolve time — NOT realtime, NOT public-select) ──
create table if not exists harvest.votes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references harvest.sessions(id) on delete cascade,
  work int not null,
  attempt int not null,
  player_id uuid references harvest.players(id) on delete cascade,
  value text not null check (value in ('approve','reject')),
  created_at timestamptz default now(),
  unique (session_id, work, attempt, player_id)
);

-- ── WORK PLAYS (secret during execution) ────────────────────────────────────
create table if not exists harvest.work_plays (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references harvest.sessions(id) on delete cascade,
  work int not null,
  player_id uuid references harvest.players(id) on delete cascade,
  card text not null check (card in ('fruit','weed')),
  created_at timestamptz default now(),
  unique (session_id, work, player_id)
);

-- ── PUBLIC EVENT LOG (banners; carries vote reveal payloads) ────────────────
create table if not exists harvest.events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references harvest.sessions(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz default now()
);

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
alter table harvest.sessions       enable row level security;
alter table harvest.players        enable row level security;
alter table harvest.player_secrets enable row level security;
alter table harvest.player_roles   enable row level security;
alter table harvest.votes          enable row level security;
alter table harvest.work_plays     enable row level security;
alter table harvest.events         enable row level security;

-- Public, non-secret tables: open (session-scoped trust model).
drop policy if exists "sessions rw" on harvest.sessions;
create policy "sessions rw" on harvest.sessions for all using (true) with check (true);
drop policy if exists "players rw" on harvest.players;
create policy "players rw" on harvest.players for all using (true) with check (true);
drop policy if exists "events r" on harvest.events;
create policy "events r" on harvest.events for select using (true);

-- Secret tables: NO direct anon access. Only the SECURITY DEFINER RPCs below.
revoke all on harvest.player_secrets from anon, authenticated;
revoke all on harvest.player_roles   from anon, authenticated;
revoke all on harvest.work_plays     from anon, authenticated;
-- votes: insert/reveal only via RPC + the vote_result event (PLAN-AMENDMENTS §E)
revoke all on harvest.votes          from anon, authenticated;

-- Realtime: ONLY tables with no secrets and no pre-reveal leak.
-- (player_secrets, player_roles, work_plays, votes are intentionally absent.)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'harvest' and tablename = 'sessions'
  ) then
    execute 'alter publication supabase_realtime add table harvest.sessions';
    execute 'alter publication supabase_realtime add table harvest.players';
    execute 'alter publication supabase_realtime add table harvest.events';
  end if;
end $$;

-- ============================================================================
-- RPCs (all SECURITY DEFINER). Player-scoped ones require the per-player secret.
-- ============================================================================

-- Internal: verify a player's secret.
create or replace function harvest._verify(p_player_id uuid, p_secret text)
returns boolean language sql security definer
set search_path = harvest, public as $$
  select exists (
    select 1 from harvest.player_secrets
    where player_id = p_player_id and secret = p_secret
  );
$$;

-- 0. Join a lobby. Creates player + secret atomically; returns the secret ONCE.
create or replace function harvest.join_session(p_code text, p_name text)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare s record; pid uuid; sec text; next_seat int;
begin
  select * into s from harvest.sessions where code = upper(p_code);
  if s is null then return jsonb_build_object('ok', false, 'error', 'Ukjent kode'); end if;
  if s.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'Spillet er allerede i gang');
  end if;
  if char_length(trim(p_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Skriv inn et navn');
  end if;
  select coalesce(max(seat) + 1, 0) into next_seat
    from harvest.players where session_id = s.id;
  insert into harvest.players (session_id, name, seat)
    values (s.id, trim(p_name), next_seat) returning id into pid;
  insert into harvest.player_secrets (player_id) values (pid) returning secret into sec;
  update harvest.sessions set player_count = player_count + 1 where id = s.id;
  return jsonb_build_object('ok', true, 'player_id', pid, 'session_id', s.id,
    'seat', next_seat, 'secret', sec);
end; $$;

-- 1. Persist the deal (host only). p_assignments computed client-side in deal.ts.
create or replace function harvest.commit_deal(
  p_session_id uuid, p_host_id text, p_assignments jsonb, p_team_sizes int[]
) returns void language plpgsql security definer
set search_path = harvest, public as $$
declare a jsonb;
begin
  if not exists (select 1 from harvest.sessions where id = p_session_id and host_id = p_host_id) then
    raise exception 'Not the host';
  end if;
  delete from harvest.player_roles where session_id = p_session_id;
  for a in select * from jsonb_array_elements(p_assignments) loop
    insert into harvest.player_roles (player_id, session_id, role, team, known_player_ids)
    values (
      (a->>'player_id')::uuid, p_session_id, a->>'role', a->>'team',
      coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(a->'known_player_ids') x), '{}')
    );
  end loop;
  update harvest.sessions
    set phase='role_reveal', team_sizes=p_team_sizes,
        player_count=(select count(*) from harvest.players where session_id=p_session_id)
    where id = p_session_id;
end; $$;

-- 2. A player reads ONLY their own role + the names they're allowed to see.
create or replace function harvest.get_my_role(p_player_id uuid, p_secret text)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare r record; names jsonb;
begin
  if not harvest._verify(p_player_id, p_secret) then return null; end if;
  select * into r from harvest.player_roles where player_id = p_player_id;
  if r is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)), '[]')
    into names from harvest.players p where p.id = any(r.known_player_ids);
  return jsonb_build_object(
    'role', r.role, 'team', r.team, 'converted', r.converted,
    'converted_on_work', r.converted_on_work, 'known', names);
end; $$;

-- 2b. Confirm you've read your role (secret-gated).
create or replace function harvest.confirm_role(p_player_id uuid, p_secret text)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
begin
  if not harvest._verify(p_player_id, p_secret) then
    return jsonb_build_object('ok', false, 'error', 'Auth'); end if;
  update harvest.players set role_confirmed = true where id = p_player_id;
  return jsonb_build_object('ok', true);
end; $$;

-- 2c. Begin the works (host). role_reveal → work_proposal once roles are read.
create or replace function harvest.begin_works(p_session_id uuid, p_host_id text)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare s record;
begin
  if not exists (select 1 from harvest.sessions where id=p_session_id and host_id=p_host_id) then
    raise exception 'Not the host'; end if;
  select * into s from harvest.sessions where id=p_session_id;
  if s.phase <> 'role_reveal' then return jsonb_build_object('ok', false, 'error', 'Feil fase'); end if;
  update harvest.sessions
    set phase='work_proposal', current_work=1, current_attempt=1,
        leader_seat=0, reject_count=0, proposed_team='{}'
    where id=p_session_id;
  return jsonb_build_object('ok', true);
end; $$;

-- 3. Saulus converts (Acts 9). Public, irreversible, blinding.
create or replace function harvest.convert_saul(p_player_id uuid, p_secret text)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare r record; s record; pname text;
begin
  if not harvest._verify(p_player_id, p_secret) then
    return jsonb_build_object('ok', false, 'error', 'Auth'); end if;
  select * into r from harvest.player_roles where player_id = p_player_id for update;
  if r is null or r.role <> 'saulus' then return jsonb_build_object('ok', false, 'error', 'Not Saulus'); end if;
  if r.converted then return jsonb_build_object('ok', false, 'error', 'Already converted'); end if;
  select * into s from harvest.sessions where id = r.session_id;
  if s.phase not in ('work_proposal','work_vote') then
    return jsonb_build_object('ok', false, 'error', 'Kan kun omvende seg under forslag eller avstemning');
  end if;
  update harvest.player_roles
    set team='faithful', converted=true, converted_on_work=s.current_work,
        known_player_ids='{}'                       -- the blinding (Acts 9:8-9)
    where player_id = p_player_id;
  select name into pname from harvest.players where id = p_player_id;
  insert into harvest.events (session_id, type, payload)
    values (r.session_id, 'conversion',
      jsonb_build_object('player_id', p_player_id, 'name', pname, 'work', s.current_work));
  return jsonb_build_object('ok', true);
end; $$;

-- 3b. Elder proposes a team (host or the leader can submit; gated by host_id OR secret+seat).
create or replace function harvest.propose_team(
  p_session_id uuid, p_player_id uuid, p_secret text, p_team uuid[]
) returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare s record; pseat int; need int;
begin
  if not harvest._verify(p_player_id, p_secret) then
    return jsonb_build_object('ok', false, 'error', 'Auth'); end if;
  select * into s from harvest.sessions where id = p_session_id;
  if s.phase <> 'work_proposal' then return jsonb_build_object('ok', false, 'error', 'Feil fase'); end if;
  select seat into pseat from harvest.players where id = p_player_id;
  if pseat is distinct from s.leader_seat then
    return jsonb_build_object('ok', false, 'error', 'Du er ikke Eldste'); end if;
  need := s.team_sizes[s.current_work];
  if array_length(p_team, 1) is distinct from need then
    return jsonb_build_object('ok', false, 'error', 'Feil lagstørrelse'); end if;
  update harvest.sessions set proposed_team = p_team, phase = 'work_vote' where id = p_session_id;
  return jsonb_build_object('ok', true);
end; $$;

-- 3c. Cast a vote (secret-gated; not revealed until resolve_vote).
create or replace function harvest.cast_vote(
  p_player_id uuid, p_secret text, p_value text
) returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare r record; s record;
begin
  if not harvest._verify(p_player_id, p_secret) then
    return jsonb_build_object('ok', false, 'error', 'Auth'); end if;
  if p_value not in ('approve','reject') then
    return jsonb_build_object('ok', false, 'error', 'Bad value'); end if;
  select * into r from harvest.player_roles where player_id = p_player_id;
  select * into s from harvest.sessions where id = r.session_id;
  if s.phase <> 'work_vote' then return jsonb_build_object('ok', false, 'error', 'Feil fase'); end if;
  insert into harvest.votes (session_id, work, attempt, player_id, value)
    values (r.session_id, s.current_work, s.current_attempt, p_player_id, p_value)
    on conflict (session_id, work, attempt, player_id) do update set value = excluded.value;
  return jsonb_build_object('ok', true);
end; $$;

-- 3d. How many votes are in (count only — no values; for host auto-advance).
create or replace function harvest.vote_progress(p_session_id uuid)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare s record; n int;
begin
  select * into s from harvest.sessions where id = p_session_id;
  select count(*) into n from harvest.votes
    where session_id = p_session_id and work = s.current_work and attempt = s.current_attempt;
  return jsonb_build_object('submitted', n, 'total', s.player_count);
end; $$;

-- 4. Resolve a vote (host). Full-roster denominator; abstentions = reject;
--    Barnabas weight ×2 (PLAN-AMENDMENTS §D). Reveals every vote in the payload.
create or replace function harvest.resolve_vote(p_session_id uuid, p_host_id text)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare s record; total_weight numeric := 0; approve_weight numeric := 0; v record; votes_json jsonb;
begin
  if not exists (select 1 from harvest.sessions where id=p_session_id and host_id=p_host_id) then
    raise exception 'Not the host'; end if;
  select * into s from harvest.sessions where id = p_session_id;

  -- Denominator = weight of ALL players, not just those who voted.
  select coalesce(sum(case when role='barnabas' then 2 else 1 end), 0)
    into total_weight from harvest.player_roles where session_id = p_session_id;

  -- Numerator = weight of explicit approve votes only (missing vote ⇒ reject).
  for v in
    select vt.value, pr.role from harvest.votes vt
    join harvest.player_roles pr on pr.player_id = vt.player_id
    where vt.session_id=p_session_id and vt.work=s.current_work and vt.attempt=s.current_attempt
  loop
    if v.value = 'approve' then
      approve_weight := approve_weight + (case when v.role='barnabas' then 2 else 1 end);
    end if;
  end loop;

  -- Per-player reveal (face up) for the event payload.
  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', vt.player_id, 'value', vt.value,
           'weight', case when pr.role='barnabas' then 2 else 1 end)), '[]')
    into votes_json
    from harvest.votes vt join harvest.player_roles pr on pr.player_id = vt.player_id
    where vt.session_id=p_session_id and vt.work=s.current_work and vt.attempt=s.current_attempt;

  if approve_weight > total_weight / 2.0 then
    update harvest.sessions set phase='work_execution' where id=p_session_id;
    insert into harvest.events (session_id,type,payload)
      values (p_session_id,'vote_result', jsonb_build_object('approved', true, 'votes', votes_json));
    return jsonb_build_object('approved', true);
  end if;

  -- Rejected.
  if s.reject_count + 1 >= 5 then
    -- Five rejects on the same work ⇒ work abandoned = choked.
    update harvest.sessions set
      choked_works = choked_works + 1, reject_count = 0,
      leader_seat = (leader_seat + 1) % player_count,
      phase = case when choked_works + 1 >= 3 then 'ended' else 'work_proposal' end,
      current_work = case when choked_works + 1 >= 3 then current_work else current_work + 1 end,
      current_attempt = 1, proposed_team='{}',
      outcome = case when choked_works + 1 >= 3 then 'betrayer_win' else outcome end
      where id = p_session_id;
  else
    update harvest.sessions set
      reject_count = reject_count + 1,
      leader_seat = (leader_seat + 1) % player_count,
      current_attempt = current_attempt + 1,
      proposed_team = '{}',
      phase = 'work_proposal'          -- next Elder proposes
      where id = p_session_id;
  end if;
  insert into harvest.events (session_id,type,payload)
    values (p_session_id,'vote_result', jsonb_build_object('approved', false, 'votes', votes_json));
  return jsonb_build_object('approved', false);
end; $$;

-- 5. Submit a work card. Faithful (incl. converted) are forced to Frukt.
create or replace function harvest.submit_card(p_player_id uuid, p_secret text, p_card text)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare r record; s record; c text;
begin
  if not harvest._verify(p_player_id, p_secret) then
    return jsonb_build_object('ok', false, 'error', 'Auth'); end if;
  select * into r from harvest.player_roles where player_id=p_player_id;
  select * into s from harvest.sessions where id=r.session_id;
  if s.phase <> 'work_execution' then return jsonb_build_object('ok', false, 'error','Ikke gjerningsfase'); end if;
  if not (p_player_id = any(s.proposed_team)) then return jsonb_build_object('ok', false, 'error','Ikke på laget'); end if;
  c := p_card;
  if r.team = 'faithful' and c = 'weed' then c := 'fruit'; end if; -- enforce
  insert into harvest.work_plays (session_id, work, player_id, card)
    values (r.session_id, s.current_work, p_player_id, c)
    on conflict (session_id, work, player_id) do nothing;
  return jsonb_build_object('ok', true);
end; $$;

-- 6. Card-submission progress (count only, no attribution; for host auto-advance).
create or replace function harvest.work_progress(p_session_id uuid, p_work int)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare s record; submitted int; team_size int;
begin
  select * into s from harvest.sessions where id = p_session_id;
  select count(*) into submitted from harvest.work_plays
    where session_id = p_session_id and work = p_work;
  team_size := coalesce(array_length(s.proposed_team, 1), 0);
  return jsonb_build_object('submitted', submitted, 'total', team_size);
end; $$;

-- 7. Resolve a work (host). Applies two-weed rule; reveals COUNTS only.
create or replace function harvest.resolve_work(p_session_id uuid, p_host_id text)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare s record; weed int; fruit int; need int; bore_fruit bool;
begin
  if not exists (select 1 from harvest.sessions where id=p_session_id and host_id=p_host_id) then
    raise exception 'Not the host'; end if;
  select * into s from harvest.sessions where id=p_session_id;
  select count(*) filter (where card='weed'), count(*) filter (where card='fruit')
    into weed, fruit
    from harvest.work_plays where session_id=p_session_id and work=s.current_work;
  need := case when s.player_count >= 7 and s.current_work = 4 then 2 else 1 end;
  bore_fruit := weed < need;

  update harvest.sessions set
    fruit_works  = fruit_works  + (case when bore_fruit then 1 else 0 end),
    choked_works = choked_works + (case when bore_fruit then 0 else 1 end),
    reject_count = 0,
    leader_seat  = (leader_seat + 1) % player_count
    where id = p_session_id;

  insert into harvest.events (session_id,type,payload) values
    (p_session_id,'work_result',
     jsonb_build_object('work', s.current_work, 'fruit', bore_fruit, 'weeds', weed, 'fruits', fruit));

  select * into s from harvest.sessions where id=p_session_id;
  if s.choked_works >= 3 then
    update harvest.sessions set phase='ended', outcome='betrayer_win' where id=p_session_id;
  elsif s.fruit_works >= 3 then
    update harvest.sessions set phase='judas_phase' where id=p_session_id;
  else
    update harvest.sessions set phase='work_proposal', current_work=current_work+1,
      current_attempt=1, proposed_team='{}' where id=p_session_id;
  end if;
  return jsonb_build_object('fruit', bore_fruit, 'weeds', weed);
end; $$;

-- 8. Judas strikes.
create or replace function harvest.judas_strike(
  p_session_id uuid, p_player_id uuid, p_secret text, p_target_id uuid
) returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare is_judas bool; target_role text;
begin
  if not harvest._verify(p_player_id, p_secret) then
    return jsonb_build_object('ok', false, 'error', 'Auth'); end if;
  select role='judas' into is_judas from harvest.player_roles where player_id=p_player_id;
  if not coalesce(is_judas,false) then return jsonb_build_object('ok', false, 'error','Not Judas'); end if;
  select role into target_role from harvest.player_roles where player_id=p_target_id;
  if target_role = 'prophet' then
    update harvest.sessions set phase='ended', outcome='betrayer_win' where id=p_session_id;
    return jsonb_build_object('ok', true, 'correct', true);
  else
    update harvest.sessions set phase='ended', outcome='faithful_win' where id=p_session_id;
    return jsonb_build_object('ok', true, 'correct', false);
  end if;
end; $$;

-- 9. End-game reveal (only once phase='ended').
create or replace function harvest.get_final_reveal(p_session_id uuid)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare ended bool;
begin
  select phase='ended' into ended from harvest.sessions where id=p_session_id;
  if not coalesce(ended,false) then return null; end if;
  return (
    select jsonb_agg(jsonb_build_object(
      'name', p.name, 'seat', p.seat, 'role', pr.role, 'team', pr.team,
      'converted', pr.converted, 'converted_on_work', pr.converted_on_work)
      order by p.seat)
    from harvest.players p join harvest.player_roles pr on pr.player_id=p.id
    where p.session_id = p_session_id);
end; $$;

-- 10. Presence helpers (best-effort online state).
create or replace function harvest.set_online(p_player_id uuid, p_secret text, p_online bool)
returns void language plpgsql security definer
set search_path = harvest, public as $$
begin
  if harvest._verify(p_player_id, p_secret) then
    update harvest.players set is_online = p_online where id = p_player_id;
  end if;
end; $$;

grant execute on function
  harvest.join_session, harvest.commit_deal, harvest.get_my_role, harvest.confirm_role,
  harvest.begin_works, harvest.convert_saul, harvest.propose_team, harvest.cast_vote, harvest.vote_progress,
  harvest.resolve_vote, harvest.submit_card, harvest.work_progress, harvest.resolve_work,
  harvest.judas_strike, harvest.get_final_reveal, harvest.set_online
  to anon, authenticated;
