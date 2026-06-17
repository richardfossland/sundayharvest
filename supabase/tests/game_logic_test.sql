\set ON_ERROR_STOP on
set search_path = harvest, public;

create or replace function pg_temp.assert_eq(actual int, expected int, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL [%]: expected %, got %', label, expected, actual; end if;
  raise notice 'PASS [%] = %', label, actual;
end $$;
create or replace function pg_temp.assert_true(cond bool, label text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAIL [%]: expected true', label; end if;
  raise notice 'PASS [%]', label;
end $$;
create or replace function pg_temp.assert_text(actual text, expected text, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL [%]: expected %, got %', label, expected, actual; end if;
  raise notice 'PASS [%] = %', label, actual;
end $$;

-- Helper: insert a player with a deterministic secret 'sec-<name>'.
create or replace function pg_temp.mkplayer(p_sid uuid, p_name text, p_seat int) returns uuid language plpgsql as $$
declare pid uuid;
begin
  insert into harvest.players(session_id,name,seat) values (p_sid,p_name,p_seat) returning id into pid;
  insert into harvest.player_secrets(player_id,secret) values (pid, 'sec-'||p_name);
  return pid;
end $$;
create or replace function pg_temp.mkrole(p_pid uuid, p_sid uuid, p_role text, p_team text, p_known uuid[]) returns void language plpgsql as $$
begin
  insert into harvest.player_roles(player_id,session_id,role,team,known_player_ids)
  values (p_pid,p_sid,p_role,p_team,coalesce(p_known,'{}'));
end $$;

-- ============ Scenario A: join, deal, secret-gated reads, knowledge ============
do $$
declare sid uuid; ja jsonb; pid uuid[]; sec text[]; r jsonb; assigns jsonb;
begin
  insert into sessions(code,host_id,phase) values ('AAAA','h1','lobby') returning id into sid;
  pid := '{}'; sec := '{}';
  for i in 0..4 loop
    ja := harvest.join_session('aaaa', 'P'||i);            -- lowercase tests upper()
    perform pg_temp.assert_true((ja->>'ok')::bool, 'A: join P'||i);
    pid := pid || (ja->>'player_id')::uuid;
    sec := sec || (ja->>'secret');
  end loop;
  perform pg_temp.assert_eq((select player_count from sessions where id=sid), 5, 'A: player_count after joins');
  perform pg_temp.assert_true(harvest.join_session('AAAA','late') ->> 'error' = 'Ukjent kode' is null, 'A: code exists');

  -- seat0 prophet, seat1/2 disciple, seat3 judas, seat4 serpent
  assigns := jsonb_build_array(
    jsonb_build_object('player_id',pid[1],'role','prophet','team','faithful',
      'known_player_ids', jsonb_build_array(pid[4]::text)),                 -- prophet sees judas, NOT serpent
    jsonb_build_object('player_id',pid[2],'role','disciple','team','faithful','known_player_ids',jsonb_build_array()),
    jsonb_build_object('player_id',pid[3],'role','disciple','team','faithful','known_player_ids',jsonb_build_array()),
    jsonb_build_object('player_id',pid[4],'role','judas','team','betrayer',
      'known_player_ids', jsonb_build_array(pid[5]::text)),
    jsonb_build_object('player_id',pid[5],'role','serpent','team','betrayer',
      'known_player_ids', jsonb_build_array(pid[4]::text))
  );
  perform harvest.commit_deal(sid,'h1',assigns,'{2,3,2,3,3}');
  perform pg_temp.assert_text((select phase from sessions where id=sid),'role_reveal','A: phase after deal');

  -- prophet reads own role with correct secret
  r := harvest.get_my_role(pid[1], sec[1]);
  perform pg_temp.assert_text(r->>'role','prophet','A: prophet sees own role');
  perform pg_temp.assert_eq(jsonb_array_length(r->'known'),1,'A: prophet known count (serpent hidden)');
  perform pg_temp.assert_true((select count(*) from jsonb_array_elements(r->'known') e where e->>'id'=pid[4]::text)=1,'A: prophet sees judas');
  perform pg_temp.assert_true((select count(*) from jsonb_array_elements(r->'known') e where e->>'id'=pid[5]::text)=0,'A: prophet does NOT see serpent');

  -- SECURITY: wrong secret returns null (cannot read another player by guessing UUID)
  perform pg_temp.assert_true(harvest.get_my_role(pid[1],'WRONG') is null,'A: wrong secret blocked');
  perform pg_temp.assert_true(harvest.get_my_role(pid[3],'sec-P0') is null,'A: cannot read other player with own secret');

  -- betrayers see each other; disciple sees nothing
  perform pg_temp.assert_eq(jsonb_array_length((harvest.get_my_role(pid[4],sec[4]))->'known'),1,'A: judas sees serpent');
  perform pg_temp.assert_eq(jsonb_array_length((harvest.get_my_role(pid[2],sec[2]))->'known'),0,'A: disciple sees nothing');
end $$;

-- ============ Scenario B: vote resolution math ============
do $$
declare sid uuid; pr uuid; ba uuid; di uuid; ju uuid; mi uuid; r jsonb;
begin
  insert into sessions(code,host_id,phase,player_count,current_work,current_attempt,leader_seat,team_sizes)
    values ('BBBB','h','work_vote',5,1,1,0,'{2,3,2,3,3}') returning id into sid;
  pr:=pg_temp.mkplayer(sid,'pr',0); ba:=pg_temp.mkplayer(sid,'ba',1); di:=pg_temp.mkplayer(sid,'di',2);
  ju:=pg_temp.mkplayer(sid,'ju',3); mi:=pg_temp.mkplayer(sid,'mi',4);
  perform pg_temp.mkrole(pr,sid,'prophet','faithful',null);
  perform pg_temp.mkrole(ba,sid,'barnabas','faithful',null);
  perform pg_temp.mkrole(di,sid,'disciple','faithful',null);
  perform pg_temp.mkrole(ju,sid,'judas','betrayer',null);
  perform pg_temp.mkrole(mi,sid,'minion','betrayer',null);

  -- B1: only 2 approve, 3 abstain. Denominator = full roster weight (6, barnabas=2).
  --     approve_weight=2, 2 > 3 false → REJECTED (abstention counts as reject).
  perform harvest.cast_vote(di,'sec-di','approve');
  perform harvest.cast_vote(mi,'sec-mi','approve');
  r := harvest.resolve_vote(sid,'h');
  perform pg_temp.assert_true(not (r->>'approved')::bool,'B1: rejected (abstain=reject, full-roster denom)');
  perform pg_temp.assert_eq((select reject_count from sessions where id=sid),1,'B1: reject_count incremented');
  perform pg_temp.assert_eq((select leader_seat from sessions where id=sid),1,'B1: leader advanced');
  perform pg_temp.assert_text((select phase from sessions where id=sid),'work_proposal','B1: back to proposal');

  -- B2: Barnabas weight ×2. Reset to work_vote attempt 2.
  update sessions set phase='work_vote', current_attempt=2 where id=sid;
  perform harvest.cast_vote(ba,'sec-ba','approve');   -- weight 2
  perform harvest.cast_vote(pr,'sec-pr','approve');   -- weight 1
  perform harvest.cast_vote(di,'sec-di','approve');   -- weight 1  => 4 of 6 > 3 → approved
  r := harvest.resolve_vote(sid,'h');
  perform pg_temp.assert_true((r->>'approved')::bool,'B2: approved with Barnabas ×2');
  perform pg_temp.assert_text((select phase from sessions where id=sid),'work_execution','B2: phase execution');
  -- prove ba truly weighed 2: same 3 voters but ba as plain would be 3 of 6 = not > 3.

  -- B3: 5th reject abandons the work (= choked).
  update sessions set phase='work_vote', current_attempt=3, reject_count=4, proposed_team='{}' where id=sid;
  r := harvest.resolve_vote(sid,'h');   -- no votes → rejected → 4+1>=5
  perform pg_temp.assert_true(not (r->>'approved')::bool,'B3: 5th reject');
  perform pg_temp.assert_eq((select choked_works from sessions where id=sid),1,'B3: work abandoned = choked');
  perform pg_temp.assert_eq((select reject_count from sessions where id=sid),0,'B3: reject_count reset');
  perform pg_temp.assert_eq((select current_work from sessions where id=sid),2,'B3: advanced to next work');
end $$;

-- ============ Scenario C: work execution + two-weed rule + faithful coercion ============
do $$
declare sid uuid; fa uuid; fb uuid; be uuid; r jsonb;
begin
  -- C1: single weed chokes (work 1, need 1)
  insert into sessions(code,host_id,phase,player_count,current_work,leader_seat,team_sizes)
    values ('CCC1','h','work_execution',5,1,0,'{2,3,2,3,3}') returning id into sid;
  fa:=pg_temp.mkplayer(sid,'fa',0); be:=pg_temp.mkplayer(sid,'be',1);
  perform pg_temp.mkrole(fa,sid,'disciple','faithful',null);
  perform pg_temp.mkrole(be,sid,'minion','betrayer',null);
  update sessions set proposed_team=array[fa,be] where id=sid;
  perform harvest.submit_card(fa,'sec-fa','fruit');
  perform harvest.submit_card(be,'sec-be','weed');
  r := harvest.resolve_work(sid,'h');
  perform pg_temp.assert_true(not (r->>'fruit')::bool,'C1: single weed chokes');
  perform pg_temp.assert_eq((select choked_works from sessions where id=sid),1,'C1: choked_works=1');

  -- C2: faithful playing weed is coerced to fruit
  insert into sessions(code,host_id,phase,player_count,current_work,leader_seat,team_sizes)
    values ('CCC2','h','work_execution',5,1,0,'{2,3,2,3,3}') returning id into sid;
  fa:=pg_temp.mkplayer(sid,'fa',0); fb:=pg_temp.mkplayer(sid,'fb',1);
  perform pg_temp.mkrole(fa,sid,'disciple','faithful',null);
  perform pg_temp.mkrole(fb,sid,'prophet','faithful',null);
  update sessions set proposed_team=array[fa,fb] where id=sid;
  perform harvest.submit_card(fa,'sec-fa','weed');   -- should be forced to fruit
  perform harvest.submit_card(fb,'sec-fb','fruit');
  perform pg_temp.assert_text((select card from work_plays where player_id=fa),'fruit','C2: faithful weed coerced to fruit');
  r := harvest.resolve_work(sid,'h');
  perform pg_temp.assert_true((r->>'fruit')::bool,'C2: work bears fruit');

  -- C3: two-weed rule — 7 players, work 4, one weed survives
  insert into sessions(code,host_id,phase,player_count,current_work,leader_seat,team_sizes)
    values ('CCC3','h','work_execution',7,4,0,'{2,3,3,4,4}') returning id into sid;
  fa:=pg_temp.mkplayer(sid,'fa',0); be:=pg_temp.mkplayer(sid,'be',1);
  perform pg_temp.mkrole(fa,sid,'disciple','faithful',null);
  perform pg_temp.mkrole(be,sid,'minion','betrayer',null);
  update sessions set proposed_team=array[fa,be] where id=sid;
  perform harvest.submit_card(fa,'sec-fa','fruit');
  perform harvest.submit_card(be,'sec-be','weed');   -- only 1 weed; work 4 @7p needs 2
  r := harvest.resolve_work(sid,'h');
  perform pg_temp.assert_true((r->>'fruit')::bool,'C3: one weed survives the two-weed work');
end $$;

-- ============ Scenario D: judas endgame ============
do $$
declare sid uuid; pr uuid; ju uuid; di uuid; r jsonb;
begin
  -- reach 3 fruit → judas_phase
  insert into sessions(code,host_id,phase,player_count,current_work,leader_seat,team_sizes,fruit_works)
    values ('DDDD','h','work_execution',5,3,0,'{2,3,2,3,3}',2) returning id into sid;
  pr:=pg_temp.mkplayer(sid,'pr',0); ju:=pg_temp.mkplayer(sid,'ju',1); di:=pg_temp.mkplayer(sid,'di',2);
  perform pg_temp.mkrole(pr,sid,'prophet','faithful',null);
  perform pg_temp.mkrole(ju,sid,'judas','betrayer',null);
  perform pg_temp.mkrole(di,sid,'disciple','faithful',null);
  update sessions set proposed_team=array[pr,di] where id=sid;
  perform harvest.submit_card(pr,'sec-pr','fruit');
  perform harvest.submit_card(di,'sec-di','fruit');
  perform harvest.resolve_work(sid,'h');
  perform pg_temp.assert_eq((select fruit_works from sessions where id=sid),3,'D: fruit_works=3');
  perform pg_temp.assert_text((select phase from sessions where id=sid),'judas_phase','D: judas_phase reached');

  -- wrong guess → faithful win
  r := harvest.judas_strike(sid,ju,'sec-ju',di);
  perform pg_temp.assert_true(not (r->>'correct')::bool,'D: judas wrong');
  perform pg_temp.assert_text((select outcome from sessions where id=sid),'faithful_win','D: faithful win on wrong guess');
  perform pg_temp.assert_true(harvest.get_final_reveal(sid) is not null,'D: final reveal available when ended');
end $$;

do $$
declare sid uuid; pr uuid; ju uuid; r jsonb;
begin
  insert into sessions(code,host_id,phase,player_count,leader_seat)
    values ('DDD2','h','judas_phase',5,0) returning id into sid;
  pr:=pg_temp.mkplayer(sid,'pr',0); ju:=pg_temp.mkplayer(sid,'ju',1);
  perform pg_temp.mkrole(pr,sid,'prophet','faithful',null);
  perform pg_temp.mkrole(ju,sid,'judas','betrayer',null);
  r := harvest.judas_strike(sid,ju,'sec-ju',pr);   -- correct
  perform pg_temp.assert_true((r->>'correct')::bool,'D2: judas correct');
  perform pg_temp.assert_text((select outcome from sessions where id=sid),'betrayer_win','D2: betrayers steal win');
  -- non-judas cannot strike
  perform pg_temp.assert_true(not (harvest.judas_strike(sid,pr,'sec-pr',ju) ->> 'ok')::bool,'D2: non-judas blocked');
end $$;

-- ============ Scenario E: Saulus conversion (Acts 9) ============
do $$
declare sid uuid; sa uuid; al uuid; r jsonb; mr jsonb;
begin
  insert into sessions(code,host_id,phase,player_count,current_work,leader_seat,team_sizes)
    values ('EEEE','h','work_proposal',7,2,0,'{2,3,3,4,4}') returning id into sid;
  sa:=pg_temp.mkplayer(sid,'sa',0); al:=pg_temp.mkplayer(sid,'al',1);
  perform pg_temp.mkrole(sa,sid,'saulus','betrayer',array[al]);   -- saulus sees ally al
  perform pg_temp.mkrole(al,sid,'minion','betrayer',array[sa]);

  -- convert during proposal: ok, becomes faithful, blinded, event emitted
  r := harvest.convert_saul(sa,'sec-sa');
  perform pg_temp.assert_true((r->>'ok')::bool,'E: convert ok during proposal');
  perform pg_temp.assert_text((select team from player_roles where player_id=sa),'faithful','E: now faithful');
  perform pg_temp.assert_true((select converted from player_roles where player_id=sa),'E: converted flag');
  perform pg_temp.assert_eq((select converted_on_work from player_roles where player_id=sa),2,'E: converted_on_work');
  perform pg_temp.assert_eq((select array_length(known_player_ids,1) from player_roles where player_id=sa) is null::int, 1, 'E: blinded (known wiped)');
  perform pg_temp.assert_eq((select count(*)::int from events where session_id=sid and type='conversion'),1,'E: conversion event emitted');
  -- get_my_role reflects conversion + empty known
  mr := harvest.get_my_role(sa,'sec-sa');
  perform pg_temp.assert_true((mr->>'converted')::bool,'E: get_my_role converted');
  perform pg_temp.assert_eq(jsonb_array_length(mr->'known'),0,'E: get_my_role known empty');

  -- cannot convert twice
  perform pg_temp.assert_true(not (harvest.convert_saul(sa,'sec-sa') ->> 'ok')::bool,'E: cannot convert twice');

  -- converted saul on a team is forced to fruit
  update sessions set phase='work_execution', proposed_team=array[sa,al] where id=sid;
  perform harvest.submit_card(sa,'sec-sa','weed');   -- now faithful → coerced
  perform pg_temp.assert_text((select card from work_plays where player_id=sa),'fruit','E: converted saul forced to fruit');
end $$;

-- E2: cannot convert during execution
do $$
declare sid uuid; sa uuid;
begin
  insert into sessions(code,host_id,phase,player_count,current_work,team_sizes)
    values ('EEE2','h','work_execution',7,1,'{2,3,3,4,4}') returning id into sid;
  sa:=pg_temp.mkplayer(sid,'sa',0);
  perform pg_temp.mkrole(sa,sid,'saulus','betrayer',null);
  perform pg_temp.assert_true(not (harvest.convert_saul(sa,'sec-sa') ->> 'ok')::bool,'E2: no conversion mid-execution');
end $$;

-- ============ Scenario F: proposal + begin_works guards ============
do $$
declare sid uuid; l0 uuid; p1 uuid; p2 uuid; r jsonb;
begin
  insert into sessions(code,host_id,phase,player_count,team_sizes) values ('FFFF','h','role_reveal',3,'{2,3,2,3,3}') returning id into sid;
  l0:=pg_temp.mkplayer(sid,'l0',0); p1:=pg_temp.mkplayer(sid,'p1',1); p2:=pg_temp.mkplayer(sid,'p2',2);
  perform pg_temp.mkrole(l0,sid,'prophet','faithful',null);
  perform pg_temp.mkrole(p1,sid,'disciple','faithful',null);
  perform pg_temp.mkrole(p2,sid,'judas','betrayer',null);

  -- begin_works: non-host blocked? (host check raises) — test host transitions role_reveal→proposal
  perform harvest.begin_works(sid,'h');
  perform pg_temp.assert_text((select phase from sessions where id=sid),'work_proposal','F: begin_works → proposal');
  perform pg_temp.assert_eq((select leader_seat from sessions where id=sid),0,'F: leader seat 0');

  -- non-leader cannot propose
  perform pg_temp.assert_true(not (harvest.propose_team(sid,p1,'sec-p1',array[l0,p1]) ->> 'ok')::bool,'F: non-leader blocked');
  -- wrong team size rejected (work1 needs 2)
  perform pg_temp.assert_true(not (harvest.propose_team(sid,l0,'sec-l0',array[l0]) ->> 'ok')::bool,'F: wrong size blocked');
  -- correct proposal advances to vote
  r := harvest.propose_team(sid,l0,'sec-l0',array[l0,p1]);
  perform pg_temp.assert_true((r->>'ok')::bool,'F: valid proposal ok');
  perform pg_temp.assert_text((select phase from sessions where id=sid),'work_vote','F: phase → vote');
end $$;

-- ============ Scenario G: 0002 hardening — session-write lockdown + create_session ============
-- After 0002, anon/authenticated may NOT write sessions/players directly; the only
-- session-creation path is the create_session() SECURITY DEFINER RPC.
do $$
declare r jsonb; sid uuid;
begin
  r := harvest.create_session('host-xyz');
  perform pg_temp.assert_true((r->>'ok')::bool, 'G: create_session ok');
  sid := (r->>'id')::uuid;
  perform pg_temp.assert_true(sid is not null, 'G: create_session returns id');
  perform pg_temp.assert_eq(char_length(r->>'code'), 4, 'G: code is 4 chars');
  perform pg_temp.assert_true(exists(select 1 from sessions where id = sid), 'G: session row created');
  perform pg_temp.assert_text((select phase from sessions where id = sid), 'lobby', 'G: new session in lobby');
end $$;

-- anon is blocked from a direct INSERT into sessions (the hole 0002 closes)…
set role anon;
do $$
declare blocked bool := false;
begin
  begin
    insert into harvest.sessions(code, host_id) values ('ZZZZ','anon-forge');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.assert_true(blocked, 'G: anon direct sessions INSERT blocked');
  -- …but anon CAN still create a session through the SECURITY DEFINER RPC.
  perform pg_temp.assert_true((harvest.create_session('anon-host') ->> 'ok')::bool, 'G: anon create_session via RPC ok');
end $$;
reset role;

select '✅ ALL GAME-LOGIC TESTS PASSED' as result;
