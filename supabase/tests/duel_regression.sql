-- 1v1-Ablauf (Regression für M.1): Ausgabe muss vor und nach der Mehrspieler-Migration gleich sein.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
\set u1 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000001'',false); set role authenticated;'
\set u2 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000002'',false); set role authenticated;'
\set u3 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000003'',false); set role authenticated;'
\set u4 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000004'',false); set role authenticated;'
\o /dev/null
:u1
\o

-- ===== Raum A: 2 Geräte, verdeckter Draft =====
:u1
select 'A01 create', tst.x($$insert into tst.v select 'A', room_id::text from mb_create_room('Ana','auto','two',true)$$);
select 'A02 code', tst.x($$insert into tst.v select 'Acode', code from mb_rooms where id=tst.r('A')$$);
:u2
select 'A03 join p2', tst.q($$(select player_slot||'/'||role from mb_join_room((select v from tst.v where k='Acode'),'Ben','player'))$$);
select 'A04 rejoin p2', tst.q($$(select player_slot||'/'||role from mb_join_room((select v from tst.v where k='Acode'),'Ben','player'))$$);
:u3
select 'A05 join p3', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Acode'),'Cem','player'))$$);
select 'A06 join quizzer', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Acode'),'Cem','quizzer'))$$);
:u2
select 'A07 local p2 by guest', tst.q($$(select player_slot from mb_add_local_player2(tst.r('A'),'X'))$$);
select 'A08 sp wrong slot', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('A'),1,true,'b',50)$$);
select 'A09 sp slot 3', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('A'),3,true,'b',50)$$);
select 'A10 sp p2', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('A'),2,true,'b',50)$$);
select 'A11 guest status', tst.x($$update mb_rooms set status='draft' where id=tst.r('A')$$);
:u1
select 'A12 sp p1', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('A'),1,true,'a',60)$$);
select 'A13 start draft', tst.x($$update mb_rooms set status='draft',updated_at=now() where id=tst.r('A')$$);
select 'A14 turn', tst.q($$tst.turn(tst.r('A'),'draft')$$);
select 'A15 pick r1 s1', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('A'),auth.uid(),1,1,'a11','A11')$$);
select 'A16 pick as slot2', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('A'),auth.uid(),2,1,'a21','A21')$$);
select 'A17 turn', tst.q($$tst.turn(tst.r('A'),'draft')$$);
select 'A18 skip p1', tst.x($$select mb_use_draft_skip(tst.r('A'),1,'s1')$$);
select 'A19 skip p1 again', tst.x($$select mb_use_draft_skip(tst.r('A'),1,'s1b')$$);
select 'A20 skip slot 2 by p1', tst.x($$select mb_use_draft_skip(tst.r('A'),2,'s1c')$$);
select 'A21 skip slot 7', tst.x($$select mb_use_draft_skip(tst.r('A'),7,'s1c')$$);
select 'A22 propose off turn', tst.x($$select mb_propose_shared_skip(tst.r('A'),1,'z1','Z1',null)$$);
:u2
select 'A23 p2 sees picks', tst.q($$(select count(*) from mb_draft_picks where room_id=tst.r('A'))$$);
select 'A24 p2 board', tst.q($$(select string_agg(round_number||':'||player_slot, ',') from mb_draft_board(tst.r('A')))$$);
select 'A25 taken', tst.q($$mb_draft_artist_taken(tst.r('A'),'a11')$$);
select 'A26 propose', tst.x($$select mb_propose_shared_skip(tst.r('A'),2,'z1','Z1','https://evil/x')$$);
select 'A27 proposal', tst.q($$(select draft_skip_proposal::text from mb_rooms where id=tst.r('A'))$$);
select 'A28 propose again', tst.x($$select mb_propose_shared_skip(tst.r('A'),2,'z2','Z2',null)$$);
:u1
select 'A29 accept', tst.x($$select mb_answer_shared_skip(tst.r('A'),1,true)$$);
select 'A30 skips', tst.q($$(select coalesce(draft_skip_proposal::text,'-')||' '||draft_shared_skips::text from mb_rooms where id=tst.r('A'))$$);
:u2
select 'A31 propose 2', tst.x($$select mb_propose_shared_skip(tst.r('A'),2,'z3','Z3',null)$$);
:u1
select 'A32 reject', tst.x($$select mb_answer_shared_skip(tst.r('A'),1,false)$$);
:u2
select 'A33 propose 3', tst.x($$select mb_propose_shared_skip(tst.r('A'),2,'z4','Z4',null)$$);
select 'A34 withdraw', tst.x($$select mb_answer_shared_skip(tst.r('A'),2,true)$$);
select 'A35 skips', tst.q($$(select coalesce(draft_skip_proposal::text,'-')||' '||draft_shared_skips::text from mb_rooms where id=tst.r('A'))$$);
select 'A36 answer none', tst.x($$select mb_answer_shared_skip(tst.r('A'),2,true)$$);
select 'A37 propose taken', tst.x($$select mb_propose_shared_skip(tst.r('A'),2,'a11','A11',null)$$);
select 'A38 dup artist', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('A'),auth.uid(),2,1,'a11','dup')$$);
select 'A39 pick r1 s2', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('A'),auth.uid(),2,1,'a21','A21')$$);
select 'A40 pick r1 s2 again', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('A'),auth.uid(),2,1,'a21b','A21b')$$);
select 'A41 pick r7', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('A'),auth.uid(),2,7,'a27','A27')$$);
-- restliche Picks
:u1
select 'A42 picks p1', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) select tst.r('A'),auth.uid(),1,r,'a1'||r,'A1'||r from generate_series(2,5) r$$);
:u2
select 'A43 picks p2', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) select tst.r('A'),auth.uid(),2,r,'a2'||r,'A2'||r from generate_series(2,5) r$$);
select 'A44 turn after 10', tst.q($$tst.turn(tst.r('A'),'draft')$$);
select 'A45 p2 sees (draft done, round 0)', tst.q($$(select count(*) from mb_draft_picks where room_id=tst.r('A'))$$);
select 'A46 start battle guest', tst.x($$select mb_start_battle(tst.r('A'),'[]'::jsonb)$$);
:u1
select 'A47 start battle 4', tst.x($$select mb_start_battle(tst.r('A'),'[{"theme":"t1","category":"c"},{"theme":"t2","category":"c"},{"theme":"t3","category":"c"},{"theme":"t4","category":"c"}]'::jsonb)$$);
select 'A48 start battle', tst.x($$select mb_start_battle(tst.r('A'),(select jsonb_agg(jsonb_build_object('round_number',i,'theme','t'||i,'category','c')) from generate_series(1,5) i))$$);
select 'A49 start battle again', tst.x($$select mb_start_battle(tst.r('A'),'[]'::jsonb)$$);
select 'A50 room', tst.q($$(select status||' r'||current_round from mb_rooms where id=tst.r('A'))$$);
select 'A51 rounds', tst.q($$(select string_agg(round_number||':'||status, ',' order by round_number) from mb_rounds where room_id=tst.r('A'))$$);
:u2
select 'A52 p2 sees', tst.q($$(select string_agg(round_number||':'||player_slot, ',' order by round_number,player_slot) from mb_draft_picks where room_id=tst.r('A'))$$);
-- Runden spielen: Sieger 1,1,1,2,2 -> 3:3 -> Gleichstand
select 'A53 vote before songs', tst.x($$select mb_cast_category_votes(tst.rid(tst.r('A'),1),tst.mem(tst.r('A')),tst.votes(2))$$);
:u1
select 'A54 sub p1 r1', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) values(tst.r('A'),tst.rid(tst.r('A'),1),auth.uid(),1,'t11','spotify:track:t11','S11','A11')$$);
select 'A55 sub as slot2', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) values(tst.r('A'),tst.rid(tst.r('A'),1),auth.uid(),2,'t21','spotify:track:t21','S21','A21')$$);
:u2
select 'A56 sub p2 r1', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) values(tst.r('A'),tst.rid(tst.r('A'),1),auth.uid(),2,'t21','spotify:track:t21','S21','A21')$$);
select 'A57 start_ms', tst.x($$update mb_submissions set start_ms=30000 where round_id=tst.rid(tst.r('A'),1) and player_slot=2$$);
select 'A58 change song', tst.x($$update mb_submissions set song_name='x' where round_id=tst.rid(tst.r('A'),1) and player_slot=2$$);
select 'A59 vote 3', tst.x($$select mb_cast_category_votes(tst.rid(tst.r('A'),1),tst.mem(tst.r('A')),tst.votes(3))$$);
select 'A60 vote 0', tst.x($$select mb_cast_category_votes(tst.rid(tst.r('A'),1),tst.mem(tst.r('A')),tst.votes(1,1,1,1,0))$$);
select 'A61 vote missing', tst.x($$select mb_cast_category_votes(tst.rid(tst.r('A'),1),tst.mem(tst.r('A')),'{"theme":1}'::jsonb)$$);
select 'A62 vote own', tst.q($$mb_cast_category_votes(tst.rid(tst.r('A'),1),tst.mem(tst.r('A')),tst.votes(2))$$);
select 'A63 vote change', tst.q($$mb_cast_category_votes(tst.rid(tst.r('A'),1),tst.mem(tst.r('A')),tst.votes(1,2,1,2,1))$$);
select 'A64 vote other room round', tst.x($$select mb_cast_category_votes(tst.rid(tst.r('A'),2),tst.mem(tst.r('A')),tst.votes(1))$$);
select 'A65 votes', tst.q($$(select string_agg(category||'='||choice||'/'||voter_slot||'/'||voter_role, ',' order by category) from mb_category_votes where round_id=tst.rid(tst.r('A'),1))$$);
select 'A66 tie fn', tst.q($$mb_round_vote_tie(tst.rid(tst.r('A'),1))$$);
select 'A67 advance guest', tst.x($$select mb_advance_round(tst.r('A'),1,1)$$);
:u1
select 'A68 advance winner 3', tst.x($$select mb_advance_round(tst.r('A'),1,3)$$);
select 'A69 advance 1', tst.x($$select mb_advance_round(tst.r('A'),1,1)$$);
select 'A70 room', tst.q($$(select status||' r'||current_round from mb_rooms where id=tst.r('A'))$$);
select 'A71 advance 2..5', tst.x($$select mb_advance_round(tst.r('A'),r,case when r<=3 then 1 else 2 end) from generate_series(2,5) r$$);
select 'A72 room', tst.q($$(select status||' r'||current_round from mb_rooms where id=tst.r('A'))$$);
select 'A73 rounds', tst.q($$(select string_agg(round_number||':'||status||':'||coalesce(winner_slot::text,'-'), ',' order by round_number) from mb_rounds where room_id=tst.r('A'))$$);
select 'A74 sudden begin early', tst.x($$select mb_begin_sudden_battle(tst.r('A'))$$);
select 'A75 sudden start', tst.x($$select mb_start_sudden_death(tst.r('A'),'Finale')$$);
select 'A76 sudden start again', tst.x($$select mb_start_sudden_death(tst.r('A'),'Finale')$$);
select 'A77 room', tst.q($$(select status||' r'||current_round from mb_rooms where id=tst.r('A'))$$);
select 'A78 turn sudden', tst.q($$tst.turn(tst.r('A'),'sudden_draft')$$);
select 'A79 begin 0 picks', tst.x($$select mb_begin_sudden_battle(tst.r('A'))$$);
select 'A80 pick r6 s1', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('A'),auth.uid(),1,6,'a16','A16')$$);
select 'A81 turn sudden', tst.q($$tst.turn(tst.r('A'),'sudden_draft')$$);
:u2
select 'A82 p2 sees r6', tst.q($$(select count(*) from mb_draft_picks where room_id=tst.r('A') and round_number=6)$$);
select 'A83 shared skip sudden', tst.x($$select mb_propose_shared_skip(tst.r('A'),2,'z9','Z9',null)$$);
:u1
select 'A84 accept sudden', tst.x($$select mb_answer_shared_skip(tst.r('A'),1,true)$$);
:u2
select 'A85 pick r6 s2', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('A'),auth.uid(),2,6,'a26','A26')$$);
select 'A86 turn sudden', tst.q($$tst.turn(tst.r('A'),'sudden_draft')$$);
select 'A87 p2 sees r6', tst.q($$(select count(*) from mb_draft_picks where room_id=tst.r('A') and round_number=6)$$);
:u1
select 'A88 begin', tst.x($$select mb_begin_sudden_battle(tst.r('A'))$$);
select 'A89 room', tst.q($$(select status||' r'||current_round||' '||draft_shared_skips::text from mb_rooms where id=tst.r('A'))$$);
select 'A90 rematch early', tst.x($$select mb_rematch(tst.r('A'))$$);
select 'A91 advance 6', tst.x($$select mb_advance_round(tst.r('A'),6,2)$$);
select 'A92 room', tst.q($$(select status||' r'||current_round from mb_rooms where id=tst.r('A'))$$);
:u2
select 'A93 rematch guest', tst.x($$select mb_rematch(tst.r('A'))$$);
:u1
select 'A94 rematch', tst.x($$insert into tst.v select 'A2', mb_rematch(tst.r('A'))::text$$);
select 'A95 rematch same', tst.q($$mb_rematch(tst.r('A')) = tst.r('A2')$$);
select 'A96 new room', tst.q($$(select status||' '||device_mode||' '||draft_hidden||' r'||current_round from mb_rooms where id=tst.r('A2'))$$);
select 'A97 new members', tst.q($$(select string_agg(display_name||':'||role||':'||coalesce(player_slot::text,'-')||':'||spotify_ready, ',' order by player_slot) from mb_members where room_id=tst.r('A2'))$$);
select 'A98 leave host', tst.x($$select mb_leave_room(tst.r('A2'))$$);
select 'A99 closed', tst.q($$(select status from mb_rooms where id=tst.r('A2'))$$);

-- ===== Raum B: 1 Gerät (Pass & Play), verdeckt =====
:u1
select 'B01 create', tst.x($$insert into tst.v select 'B', room_id::text from mb_create_room('Ana','auto','single',true)$$);
select 'B02 code', tst.x($$insert into tst.v select 'Bcode', code from mb_rooms where id=tst.r('B')$$);
:u2
select 'B03 join player', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Bcode'),'Ben','player'))$$);
:u1
select 'B04 local p2', tst.q($$(select player_slot||'/'||role from mb_add_local_player2(tst.r('B'),'Lea'))$$);
select 'B05 local p2 again', tst.q($$(select player_slot from mb_add_local_player2(tst.r('B'),'Lea'))$$);
select 'B06 sp', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('B'),s,true,'a',10) from generate_series(1,2) s$$);
select 'B07 draft', tst.x($$update mb_rooms set status='draft' where id=tst.r('B')$$);
select 'B08 local p2 in draft', tst.q($$(select player_slot from mb_add_local_player2(tst.r('B'),'Mo'))$$);
select 'B09 picks', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) select tst.r('B'),auth.uid(),s,r,'b'||s||r,'B'||s||r from generate_series(1,5) r, generate_series(1,2) s$$);
select 'B10 host sees', tst.q($$(select count(*) from mb_draft_picks where room_id=tst.r('B'))$$);
select 'B11 skip s2', tst.x($$select mb_use_draft_skip(tst.r('B'),2,'q')$$);
select 'B12 skip s1', tst.x($$select mb_use_draft_skip(tst.r('B'),1,'q2')$$);
select 'B13 skips', tst.q($$(select string_agg(player_slot||':'||draft_skip_used||':'||coalesce(draft_skipped_artist_id,'-'), ',' order by player_slot) from mb_members where room_id=tst.r('B'))$$);
select 'B14 battle', tst.x($$select mb_start_battle(tst.r('B'),(select jsonb_agg(jsonb_build_object('theme','t'||i,'category','c')) from generate_series(1,5) i))$$);
select 'B15 subs', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) select tst.r('B'),tst.rid(tst.r('B'),1),auth.uid(),s,'tb'||s,'spotify:track:tb'||s,'S','A' from generate_series(1,2) s$$);
select 'B16 vote s1', tst.q($$mb_cast_category_votes(tst.rid(tst.r('B'),1),tst.mem(tst.r('B'),1),tst.votes(2))$$);
select 'B17 vote s2', tst.q($$mb_cast_category_votes(tst.rid(tst.r('B'),1),tst.mem(tst.r('B'),2),tst.votes(2,1,2,1,2))$$);
select 'B18 votes', tst.q($$(select string_agg(voter_slot||category||choice, ',' order by voter_slot,category) from mb_category_votes where round_id=tst.rid(tst.r('B'),1))$$);

-- ===== Raum C: 2 Geräte mit Juroren =====
:u1
select 'C01 create', tst.x($$insert into tst.v select 'C', room_id::text from mb_create_room('Ana','auto','two',false)$$);
select 'C02 code', tst.x($$insert into tst.v select 'Ccode', code from mb_rooms where id=tst.r('C')$$);
:u2
select 'C03 join', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Ccode'),'Ben','player'))$$);
:u3
select 'C04 juror', tst.q($$(select coalesce(player_slot::text,'-')||'/'||role from mb_join_room((select v from tst.v where k='Ccode'),'Jo','juror'))$$);
:u4
select 'C05 juror 2', tst.q($$(select coalesce(player_slot::text,'-')||'/'||role from mb_join_room((select v from tst.v where k='Ccode'),'Kim','juror'))$$);
:u2
select 'C06 sp', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('C'),2,true,'b',5)$$);
:u1
select 'C07 sp', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('C'),1,true,'a',5)$$);
select 'C08 draft', tst.x($$update mb_rooms set status='draft' where id=tst.r('C')$$);
select 'C09 picks', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) select tst.r('C'),auth.uid(),1,r,'c1'||r,'C' from generate_series(1,5) r$$);
:u2
select 'C10 picks', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) select tst.r('C'),auth.uid(),2,r,'c2'||r,'C' from generate_series(1,5) r$$);
select 'C11 sees all (not hidden)', tst.q($$(select count(*) from mb_draft_picks where room_id=tst.r('C'))$$);
:u3
select 'C12 juror sees', tst.q($$(select count(*) from mb_draft_picks where room_id=tst.r('C'))$$);
select 'C13 juror pick', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('C'),auth.uid(),1,6,'cj','C')$$);
select 'C14 juror taken', tst.q($$mb_draft_artist_taken(tst.r('C'),'c11')$$);
:u1
select 'C15 battle', tst.x($$select mb_start_battle(tst.r('C'),(select jsonb_agg(jsonb_build_object('theme','t'||i,'category','c')) from generate_series(1,5) i))$$);
select 'C16 sub', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) values(tst.r('C'),tst.rid(tst.r('C'),1),auth.uid(),1,'tc1','spotify:track:tc1','S','A')$$);
:u2
select 'C17 sub', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) values(tst.r('C'),tst.rid(tst.r('C'),1),auth.uid(),2,'tc2','spotify:track:tc2','S','A')$$);
select 'C18 player votes', tst.x($$select mb_cast_category_votes(tst.rid(tst.r('C'),1),tst.mem(tst.r('C')),tst.votes(1))$$);
:u3
select 'C19 juror votes', tst.q($$mb_cast_category_votes(tst.rid(tst.r('C'),1),tst.mem(tst.r('C')),tst.votes(1,1,2,2,1))$$);
select 'C20 tie (1 of 2 done)', tst.q($$mb_round_vote_tie(tst.rid(tst.r('C'),1))$$);
:u4
select 'C21 juror 2 votes', tst.q($$mb_cast_category_votes(tst.rid(tst.r('C'),1),tst.mem(tst.r('C')),tst.votes(2,2,1,1,2))$$);
select 'C22 tie', tst.q($$mb_round_vote_tie(tst.rid(tst.r('C'),1))$$);
select 'C23 votes', tst.q($$(select string_agg(coalesce(voter_slot::text,'-')||voter_role||category||choice, ',' order by voter_name,category) from mb_category_votes where round_id=tst.rid(tst.r('C'),1))$$);
:u1
select 'C24 self decision', tst.x($$insert into mb_jury_scores(room_id,round_id,source,juror_user_id,juror_name,score_a,score_b,details) values(tst.r('C'),tst.rid(tst.r('C'),1),'human',auth.uid(),'Ana',10,9,'{"kind":"self_decision"}')$$);
select 'C25 advance', tst.x($$select mb_advance_round(tst.r('C'),1,1)$$);
:u3
select 'C26 juror leaves', tst.x($$select mb_leave_room(tst.r('C'))$$);
:u2
select 'C27 p2 leaves', tst.x($$select mb_leave_room(tst.r('C'))$$);
select 'C28 p2 rejoin', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Ccode'),'Ben','player'))$$);
select 'C29 room', tst.q($$(select status||' r'||current_round from mb_rooms where id=tst.r('C'))$$);
