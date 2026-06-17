-- 0002 — harden public-table RLS (night security audit 2026-06-13).
--
-- 0001 left harvest.sessions / harvest.players as `for all using(true) with
-- check(true)` plus broad anon/authenticated write grants. The session row holds
-- the AUTHORITATIVE game state (phase, outcome, leader_seat, proposed_team, …),
-- so any joined player could forge it directly via PostgREST — bypassing every
-- host_id check in the SECURITY DEFINER RPCs:
--   supabase.from('sessions').update({ phase:'ended', outcome:'faithful_win' })
-- i.e. instant win, self-elect as leader each round, or skip voting.
--
-- The hidden-role tables (player_roles/player_secrets/votes/work_plays) were
-- already revoked in 0001, so role secrecy is intact — this closes the separate
-- game-INTEGRITY hole on the public tables.
--
-- Legitimate writes happen ONLY through the SECURITY DEFINER RPCs, which run as
-- the function owner and are unaffected by these client grants. The client reads
-- sessions/players directly and via Realtime postgres_changes, so SELECT stays
-- open. (Note: the host_id-as-plaintext authorization weakness, audit #10, is a
-- separate follow-up — host RPCs still trust an anon-readable host_id.)
--
-- Player creation already went through join_session(); SESSION creation was the
-- one remaining direct anon INSERT (Landing host()). Revoking INSERT below would
-- break "opprett spill", so we add a create_session() SECURITY DEFINER RPC FIRST
-- (generates a unique code server-side, returns the new id) and repoint the client.

-- Host creates a session. SECURITY DEFINER so it survives the INSERT revoke below.
create or replace function harvest.create_session(p_host_id text)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ'; -- no I/O, matches client legibility
  v_code text;
  v_id uuid;
  v_try int := 0;
begin
  if char_length(coalesce(trim(p_host_id), '')) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Mangler vert-id');
  end if;
  loop
    v_try := v_try + 1;
    v_code := '';
    for _ in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * char_length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into harvest.sessions (code, host_id) values (v_code, trim(p_host_id))
        returning id into v_id;
      return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code);
    exception when unique_violation then
      if v_try >= 20 then
        return jsonb_build_object('ok', false, 'error', 'Kunne ikke generere unik kode');
      end if;
      -- rare 4-char collision: loop and try a fresh code
    end;
  end loop;
end; $$;

grant execute on function harvest.create_session(text) to anon, authenticated, service_role;

revoke insert, update, delete on harvest.sessions from anon, authenticated;
revoke insert, update, delete on harvest.players  from anon, authenticated;

-- Replace the read-write policies with read-only (service_role keeps full access
-- for admin; the SECURITY DEFINER RPCs write as owner). Idempotent: drop both
-- the old and new policy names before creating, so a re-apply is a no-op.
drop policy if exists "sessions rw" on harvest.sessions;
drop policy if exists "sessions read" on harvest.sessions;
create policy "sessions read" on harvest.sessions for select using (true);

drop policy if exists "players rw" on harvest.players;
drop policy if exists "players read" on harvest.players;
create policy "players read" on harvest.players for select using (true);
