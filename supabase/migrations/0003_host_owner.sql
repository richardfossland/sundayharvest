-- 0003 — Sunday Account host ownership ("Mine økter" dashboard).
--
-- OPTIONAL host sign-in (Sunday Account SSO) lets a vert see + manage the games
-- they created. Players/joiners/displays stay 100 % code-based — this is purely
-- additive for the host. The owner column is `harvest.sessions.host_user_id`:
-- it holds the ISSUER-project auth user id (a uuid) and is NULLABLE on purpose,
-- so anonymous, code-only hosting keeps working with owner left null.
--
-- No foreign key: the Sunday Account auth users live in the *issuer* Supabase
-- project, not this app's DATA project, so referential integrity can't be
-- enforced cross-project. Integrity is enforced in the app layer.
--
-- Idempotent + additive: safe to re-apply (CI applies it twice).

-- ── owner column ─────────────────────────────────────────────────────────────
alter table harvest.sessions
  add column if not exists host_user_id uuid;

-- Dashboard query is `where host_user_id = $me order by created_at desc`.
create index if not exists sessions_host_user_idx
  on harvest.sessions (host_user_id)
  where host_user_id is not null;

comment on column harvest.sessions.host_user_id is
  'Sunday Account (issuer project) auth user id of the host who created this '
  'session while signed in. NULL for anonymous/code-only games. No cross-project '
  'FK — integrity is enforced in the app layer.';

-- ── create-with-owner RPC ────────────────────────────────────────────────────
-- A signed-in host creates a session AND stamps the owner atomically. This is a
-- SEPARATE RPC from create_session(text) so the anonymous create path (0002) is
-- left exactly as-is. Same unique-code generation as create_session.
create or replace function harvest.create_owned_session(p_host_id text, p_host_user_id uuid)
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
      insert into harvest.sessions (code, host_id, host_user_id)
        values (v_code, trim(p_host_id), p_host_user_id)
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

grant execute on function harvest.create_owned_session(text, uuid)
  to anon, authenticated, service_role;

-- ── owner-gated delete RPC ───────────────────────────────────────────────────
-- 0002 revoked direct anon DELETE on harvest.sessions, so the dashboard delete
-- goes through this SECURITY DEFINER RPC. It deletes ONLY when the caller's
-- Sunday user id matches the row's host_user_id (so anonymous games — owner null
-- — and other hosts' games are untouchable). Children cascade via the FK
-- `on delete cascade` on players/player_secrets/player_roles/votes/work_plays/
-- events. Returns { ok, deleted } so the app layer can map 403/404.
create or replace function harvest.delete_owned_session(p_session_id uuid, p_host_user_id uuid)
returns jsonb language plpgsql security definer
set search_path = harvest, public as $$
declare v_owner uuid; v_exists bool;
begin
  select host_user_id, true into v_owner, v_exists
    from harvest.sessions where id = p_session_id;
  if not coalesce(v_exists, false) then
    return jsonb_build_object('ok', false, 'deleted', false, 'reason', 'not_found');
  end if;
  -- owner-gate: null owner (anonymous) or a different owner ⇒ refuse.
  if v_owner is null or v_owner is distinct from p_host_user_id then
    return jsonb_build_object('ok', false, 'deleted', false, 'reason', 'not_owner');
  end if;
  delete from harvest.sessions where id = p_session_id and host_user_id = p_host_user_id;
  return jsonb_build_object('ok', true, 'deleted', true);
end; $$;

grant execute on function harvest.delete_owned_session(uuid, uuid)
  to anon, authenticated, service_role;
