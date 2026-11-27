-- Gruppenmodus (M.1): Ecken, Teams, Draft reihum, Skips, Abstimmung, Punkte, Sudden Death der Gleichen, Rematch.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
\set u1 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000001'',false); set role authenticated;'
\set u2 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000002'',false); set role authenticated;'
\set u3 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000003'',false); set role authenticated;'
\set u4 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000004'',false); set role authenticated;'
\set u5 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000005'',false); set role authenticated;'
\set u6 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000006'',false); set role authenticated;'
\set u7 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000007'',false); set role authenticated;'
\set u8 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000008'',false); set role authenticated;'

-- ===== Raum G: Gruppe ohne Teams, 3 Runden, verdeckt =====
:u1
select 'G01 bad rounds', tst.x($$select mb_create_group_room('Ana',false,4,true)$$);
select 'G02 create', tst.x($$insert into tst.v select 'G', room_id::text from mb_create_group_room('Ana',false,3,true)$$);
select 'G03 code', tst.x($$insert into tst.v select 'Gcode', code from mb_rooms where id=tst.r('G')$$);
select 'G04 room', tst.q($$(select game_mode||' '||team_mode||' '||round_count||' '||device_mode||' '||coalesce(corner_count::text,'-') from mb_rooms where id=tst.r('G'))$$);
:u2
select 'G05 join', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Gcode'),'Ben','player'))$$);
:u3
select 'G06 join', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Gcode'),'Cem','player'))$$);
:u4
select 'G07 join', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Gcode'),'Dia','player'))$$);
:u5
select 'G08 join', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Gcode'),'Eli','player'))$$);
:u3
select 'G09 leave', tst.x($$select mb_leave_room(tst.r('G'))$$);
:u6
select 'G10 join takes free seat', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Gcode'),'Fay','player'))$$);
:u5
select 'G11 leave', tst.x($$select mb_leave_room(tst.r('G'))$$);
:u1
select 'G12 members', tst.q($$(select string_agg(display_name||':'||player_slot||':'||corner, ',' order by player_slot) from mb_members where room_id=tst.r('G'))$$);
select 'G13 direct status', tst.x($$update mb_rooms set status='draft' where id=tst.r('G')$$);
select 'G14 teams off', tst.x($$select mb_set_member_corner(tst.r('G'),tst.mem(tst.r('G')),2)$$);
select 'G15 not ready', tst.x($$select mb_start_draft(tst.r('G'))$$);
select 'G16 sp', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('G'),1,true,'a',9)$$);
:u2
select 'G17 sp', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('G'),2,true,'b',9)$$);
select 'G18 guest start', tst.x($$select mb_start_draft(tst.r('G'))$$);
:u6
select 'G19 sp seat 3', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('G'),3,true,'f',9)$$);
:u4
select 'G20 sp', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('G'),4,true,'d',9)$$);
:u1
select 'G21 start', tst.x($$select mb_start_draft(tst.r('G'))$$);
select 'G22 start again', tst.x($$select mb_start_draft(tst.r('G'))$$);
select 'G23 room', tst.q($$(select status||' cc'||corner_count from mb_rooms where id=tst.r('G'))$$);
select 'G24 members', tst.q($$(select string_agg(display_name||':'||player_slot||':'||corner, ',' order by player_slot) from mb_members where room_id=tst.r('G'))$$);
:u7
select 'G25 late player', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Gcode'),'Gus','player'))$$);
:u1
select 'G26 turn', tst.q($$tst.turn(tst.r('G'),'draft')$$);
select 'G27 pick r1', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),1,1,'g11','G11')$$);
select 'G28 pick other corner', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),2,1,'g21','G21')$$);
select 'G29 pick round 4', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),1,4,'g14','G14')$$);
select 'G30 turn', tst.q($$tst.turn(tst.r('G'),'draft')$$);
:u2
select 'G31 sees', tst.q($$(select count(*) from mb_draft_picks where room_id=tst.r('G'))$$);
select 'G32 pick', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),2,1,'g21','G21')$$);
:u6
select 'G33 turn', tst.q($$tst.turn(tst.r('G'),'draft')$$);
select 'G34 propose', tst.x($$select mb_propose_shared_skip(tst.r('G'),3,'zz','ZZ',null)$$);
:u1
select 'G35 accept 1', tst.x($$select mb_answer_shared_skip(tst.r('G'),1,true)$$);
select 'G36 accept 1 again', tst.x($$select mb_answer_shared_skip(tst.r('G'),1,true)$$);
select 'G37 proposal', tst.q($$(select (draft_skip_proposal->'yes')::text||' '||draft_shared_skips::text from mb_rooms where id=tst.r('G'))$$);
:u2
select 'G38 accept 2', tst.x($$select mb_answer_shared_skip(tst.r('G'),2,true)$$);
:u4
select 'G39 accept 4', tst.x($$select mb_answer_shared_skip(tst.r('G'),4,true)$$);
select 'G40 skips', tst.q($$(select coalesce(draft_skip_proposal::text,'-')||' '||draft_shared_skips::text from mb_rooms where id=tst.r('G'))$$);
:u6
select 'G41 propose', tst.x($$select mb_propose_shared_skip(tst.r('G'),3,'zy','ZY',null)$$);
:u2
select 'G42 accept 2', tst.x($$select mb_answer_shared_skip(tst.r('G'),2,true)$$);
:u4
select 'G43 reject 4', tst.x($$select mb_answer_shared_skip(tst.r('G'),4,false)$$);
select 'G44 skips', tst.q($$(select coalesce(draft_skip_proposal::text,'-')||' '||draft_shared_skips::text from mb_rooms where id=tst.r('G'))$$);
:u6
select 'G45 skip', tst.x($$select mb_use_draft_skip(tst.r('G'),3,'s3')$$);
select 'G46 skip again', tst.x($$select mb_use_draft_skip(tst.r('G'),3,'s3b')$$);
select 'G47 pick', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),3,1,'g31','G31')$$);
:u4
select 'G48 pick', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),4,1,'g41','G41')$$);
select 'G49 turn', tst.q($$tst.turn(tst.r('G'),'draft')$$);
:u1
select 'G50 picks', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),1,2,'g12','x'),(tst.r('G'),auth.uid(),1,3,'g13','x')$$);
:u2
select 'G51 picks', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),2,2,'g22','x'),(tst.r('G'),auth.uid(),2,3,'g23','x')$$);
:u6
select 'G52 picks', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),3,2,'g32','x'),(tst.r('G'),auth.uid(),3,3,'g33','x')$$);
:u4
select 'G53 picks', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),4,2,'g42','x'),(tst.r('G'),auth.uid(),4,3,'g43','x')$$);
:u1
select 'G54 battle 5', tst.x($$select mb_start_battle(tst.r('G'),(select jsonb_agg(jsonb_build_object('theme','t'||i,'category','c')) from generate_series(1,5) i))$$);
select 'G55 battle 3', tst.x($$select mb_start_battle(tst.r('G'),(select jsonb_agg(jsonb_build_object('theme','t'||i,'category','c')) from generate_series(1,3) i))$$);
select 'G56 room', tst.q($$(select status||' r'||current_round from mb_rooms where id=tst.r('G'))$$);
:u2
select 'G57 sees', tst.q($$(select string_agg(round_number||':'||player_slot, ',' order by round_number,player_slot) from mb_draft_picks where room_id=tst.r('G'))$$);
-- Runde 1: Punkte c1=15, c2=5
:u1
select 'G58 sub', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) select tst.r('G'),tst.rid(tst.r('G'),r),auth.uid(),1,'tg1'||r,'spotify:track:tg1'||r,'S','A' from generate_series(1,3) r$$);
:u2
select 'G59 sub', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) select tst.r('G'),tst.rid(tst.r('G'),r),auth.uid(),2,'tg2'||r,'spotify:track:tg2'||r,'S','A' from generate_series(1,3) r$$);
:u6
select 'G60 sub', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) select tst.r('G'),tst.rid(tst.r('G'),r),auth.uid(),3,'tg3'||r,'spotify:track:tg3'||r,'S','A' from generate_series(1,3) r$$);
select 'G61 vote 3 of 4 songs', tst.x($$select mb_cast_category_votes(tst.rid(tst.r('G'),1),tst.mem(tst.r('G')),tst.votes(1))$$);
:u4
select 'G62 sub', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) select tst.r('G'),tst.rid(tst.r('G'),r),auth.uid(),4,'tg4'||r,'spotify:track:tg4'||r,'S','A' from generate_series(1,3) r$$);
select 'G63 vote own', tst.x($$select mb_cast_category_votes(tst.rid(tst.r('G'),1),tst.mem(tst.r('G')),tst.votes(1,1,1,1,4))$$);
select 'G64 vote 5', tst.x($$select mb_cast_category_votes(tst.rid(tst.r('G'),1),tst.mem(tst.r('G')),tst.votes(5))$$);
select 'G65 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),1),tst.mem(tst.r('G')),tst.votes(1))$$);
:u6
select 'G66 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),1),tst.mem(tst.r('G')),tst.votes(1))$$);
:u2
select 'G67 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),1),tst.mem(tst.r('G')),tst.votes(1))$$);
:u1
select 'G68 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),1),tst.mem(tst.r('G')),tst.votes(2))$$);
select 'G69 voter corners', tst.q($$(select string_agg(distinct voter_slot::text, ',') from mb_category_votes where round_id=tst.rid(tst.r('G'),1))$$);
select 'G70 advance wrong round', tst.x($$select mb_advance_round(tst.r('G'),2,null)$$);
:u2
select 'G71 advance guest', tst.x($$select mb_advance_round(tst.r('G'),1,null)$$);
:u1
select 'G72 advance 1', tst.x($$select mb_advance_round(tst.r('G'),1,null)$$);
select 'G73 advance 1 again', tst.x($$select mb_advance_round(tst.r('G'),1,null)$$);
select 'G74 round 1', tst.q($$(select points::text||' w'||coalesce(winner_slot::text,'-')||' '||status from mb_rounds where id=tst.rid(tst.r('G'),1))$$);
-- Runde 2: c2=15, c1=5 -> 20:20
select 'G75 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),2),tst.mem(tst.r('G')),tst.votes(2))$$);
:u2
select 'G76 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),2),tst.mem(tst.r('G')),tst.votes(1))$$);
:u6
select 'G77 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),2),tst.mem(tst.r('G')),tst.votes(2))$$);
:u4
select 'G78 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),2),tst.mem(tst.r('G')),tst.votes(2))$$);
:u1
select 'G79 advance 2', tst.x($$select mb_advance_round(tst.r('G'),2,null)$$);
-- Runde 3 (doppelt): c1=9, c2=9, c3=1, c4=1 -> 38:38:2:2
select 'G80 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),3),tst.mem(tst.r('G')),tst.votes(2))$$);
:u2
select 'G81 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),3),tst.mem(tst.r('G')),tst.votes(1))$$);
:u6
select 'G82 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),3),tst.mem(tst.r('G')),tst.votes(1,2,1,2,4))$$);
:u4
select 'G83 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),3),tst.mem(tst.r('G')),tst.votes(1,2,1,2,3))$$);
:u1
select 'G84 advance 3', tst.x($$select mb_advance_round(tst.r('G'),3,null)$$);
select 'G85 room', tst.q($$(select status||' r'||current_round||' '||coalesce(sudden_corners::text,'-') from mb_rooms where id=tst.r('G'))$$);
select 'G86 rounds', tst.q($$(select string_agg(round_number||':'||points::text||':'||coalesce(winner_slot::text,'-'), ' | ' order by round_number) from mb_rounds where room_id=tst.r('G'))$$);
-- Sudden Death nur Ecke 1 und 2
select 'G87 sudden', tst.x($$select mb_start_sudden_death(tst.r('G'),'Finale')$$);
select 'G88 turn', tst.q($$tst.turn(tst.r('G'),'sudden_draft')$$);
:u6
select 'G89 pick not tied', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),3,6,'g36','x')$$);
select 'G90 propose not tied', tst.x($$select mb_propose_shared_skip(tst.r('G'),3,'zx','ZX',null)$$);
:u1
select 'G91 propose', tst.x($$select mb_propose_shared_skip(tst.r('G'),1,'zx','ZX',null)$$);
:u6
select 'G92 answer not tied', tst.x($$select mb_answer_shared_skip(tst.r('G'),3,false)$$);
:u2
select 'G93 accept', tst.x($$select mb_answer_shared_skip(tst.r('G'),2,true)$$);
:u1
select 'G94 pick', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),1,6,'g16','x')$$);
select 'G95 begin early', tst.x($$select mb_begin_sudden_battle(tst.r('G'))$$);
select 'G96 turn', tst.q($$tst.turn(tst.r('G'),'sudden_draft')$$);
:u2
select 'G97 pick', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('G'),auth.uid(),2,6,'g26','x')$$);
:u1
select 'G98 begin', tst.x($$select mb_begin_sudden_battle(tst.r('G'))$$);
select 'G99 sub', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) values(tst.r('G'),tst.rid(tst.r('G'),6),auth.uid(),1,'tg16','spotify:track:tg16','S','A')$$);
:u2
select 'GA0 sub', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) values(tst.r('G'),tst.rid(tst.r('G'),6),auth.uid(),2,'tg26','spotify:track:tg26','S','A')$$);
select 'GA1 tied votes', tst.x($$select mb_cast_category_votes(tst.rid(tst.r('G'),6),tst.mem(tst.r('G')),tst.votes(1))$$);
:u6
select 'GA2 vote 3', tst.x($$select mb_cast_category_votes(tst.rid(tst.r('G'),6),tst.mem(tst.r('G')),tst.votes(3))$$);
select 'GA3 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),6),tst.mem(tst.r('G')),tst.votes(1))$$);
:u4
select 'GA4 vote', tst.q($$mb_cast_category_votes(tst.rid(tst.r('G'),6),tst.mem(tst.r('G')),tst.votes(2))$$);
:u1
select 'GA5 advance no decision', tst.x($$select mb_advance_round(tst.r('G'),6,null)$$);
select 'GA6 advance not tied', tst.x($$select mb_advance_round(tst.r('G'),6,3)$$);
select 'GA7 advance host 2', tst.x($$select mb_advance_round(tst.r('G'),6,2)$$);
select 'GA8 room', tst.q($$(select status||' r'||current_round from mb_rooms where id=tst.r('G'))$$);
select 'GA9 round 6', tst.q($$(select points::text||' w'||winner_slot from mb_rounds where id=tst.rid(tst.r('G'),6))$$);
select 'GB0 rematch', tst.x($$insert into tst.v select 'G2', mb_rematch(tst.r('G'))::text$$);
select 'GB1 new room', tst.q($$(select status||' '||game_mode||' '||round_count||' '||draft_hidden||' cc'||corner_count from mb_rooms where id=tst.r('G2'))$$);
select 'GB2 members', tst.q($$(select string_agg(display_name||':'||player_slot||':'||corner, ',' order by player_slot) from mb_members where room_id=tst.r('G2'))$$);

-- ===== Raum T: Teams, 5 Runden =====
:u1
select 'T01 create', tst.x($$insert into tst.v select 'T', room_id::text from mb_create_group_room('Ana',true,5,true)$$);
select 'T02 code', tst.x($$insert into tst.v select 'Tcode', code from mb_rooms where id=tst.r('T')$$);
:u2
select 'T03 join', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Tcode'),'Ben','player'))$$);
:u3
select 'T04 join', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Tcode'),'Cem','player'))$$);
:u4
select 'T05 join', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Tcode'),'Dia','player'))$$);
:u5
select 'T06 join', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Tcode'),'Eli','player'))$$);
select 'T07 teams auto', tst.q($$(select string_agg(display_name||':'||corner, ',' order by player_slot) from mb_members where room_id=tst.r('T'))$$);
select 'T08 guest sets team', tst.x($$select mb_set_member_corner(tst.r('T'),tst.mem(tst.r('T')),3)$$);
:u1
select 'T09 bad team', tst.x($$select mb_set_member_corner(tst.r('T'),(select id from mb_members where room_id=tst.r('T') and display_name='Eli'),7)$$);
select 'T10 set Eli 3', tst.x($$select mb_set_member_corner(tst.r('T'),(select id from mb_members where room_id=tst.r('T') and display_name='Eli'),3)$$);
select 'T11 set Ben 3', tst.x($$select mb_set_member_corner(tst.r('T'),(select id from mb_members where room_id=tst.r('T') and display_name='Ben'),3)$$);
select 'T12 set Dia 3', tst.x($$select mb_set_member_corner(tst.r('T'),(select id from mb_members where room_id=tst.r('T') and display_name='Dia'),3)$$);
select 'T13 all one team', tst.x($$update mb_members set spotify_ready=true where room_id=tst.r('T')$$);
reset role;
update mb_members set spotify_ready=true where room_id=tst.r('T');
:u1
select 'T14 set Ana 3', tst.x($$select mb_set_member_corner(tst.r('T'),tst.mem(tst.r('T')),3)$$);
select 'T15 set Cem 3', tst.x($$select mb_set_member_corner(tst.r('T'),(select id from mb_members where room_id=tst.r('T') and display_name='Cem'),3)$$);
select 'T16 one team', tst.x($$select mb_start_draft(tst.r('T'))$$);
select 'T17 Ana+Cem 1', tst.x($$select mb_set_member_corner(tst.r('T'),m.id,1) from mb_members m where m.room_id=tst.r('T') and m.display_name in ('Ana','Cem')$$);
select 'T19 start', tst.x($$select mb_start_draft(tst.r('T'))$$);
select 'T20 teams', tst.q($$(select string_agg(display_name||':'||player_slot||':'||corner, ',' order by player_slot) from mb_members where room_id=tst.r('T'))$$);
select 'T21 room', tst.q($$(select status||' cc'||corner_count from mb_rooms where id=tst.r('T'))$$);
select 'T22 set after start', tst.x($$select mb_set_member_corner(tst.r('T'),tst.mem(tst.r('T')),2)$$);
-- Captain Cem zieht für Team 1, Ana sieht es, Ben (Team 2) nicht
:u3
select 'T23 captain pick', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('T'),auth.uid(),1,1,'t11','x')$$);
select 'T24 pick other team', tst.x($$insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name) values(tst.r('T'),auth.uid(),2,1,'t21','x')$$);
:u1
select 'T25 teammate sees', tst.q($$(select count(*) from mb_draft_picks where room_id=tst.r('T'))$$);
:u2
select 'T26 other team sees', tst.q($$(select count(*) from mb_draft_picks where room_id=tst.r('T'))$$);
:u1
select 'T27 skip team 1', tst.x($$select mb_use_draft_skip(tst.r('T'),1,'s')$$);
:u3
select 'T28 skip team 1 again', tst.x($$select mb_use_draft_skip(tst.r('T'),1,'s2')$$);
:u5
select 'T29 propose team 2', tst.x($$select mb_propose_shared_skip(tst.r('T'),2,'zq','ZQ',null)$$);
:u3
select 'T30 accept team 1', tst.x($$select mb_answer_shared_skip(tst.r('T'),1,true)$$);
select 'T31 skips', tst.q($$(select coalesce(draft_skip_proposal::text,'-')||' '||draft_shared_skips::text from mb_rooms where id=tst.r('T'))$$);
-- 2 Teams: Stimme fürs eigene Team erlaubt
reset role;
insert into mb_draft_picks(room_id,player_user_id,player_slot,round_number,spotify_artist_id,artist_name)
  select tst.r('T'),'00000000-0000-0000-0000-000000000001',s,r,'tt'||s||r,'x' from generate_series(1,2) s, generate_series(1,5) r where not (s=1 and r=1);
:u1
select 'T32 battle', tst.x($$select mb_start_battle(tst.r('T'),(select jsonb_agg(jsonb_build_object('theme','t'||i,'category','c')) from generate_series(1,5) i))$$);
:u3
select 'T33 sub', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) values(tst.r('T'),tst.rid(tst.r('T'),1),auth.uid(),1,'tt1','spotify:track:tt1','S','A')$$);
:u2
select 'T34 sub', tst.x($$insert into mb_submissions(room_id,round_id,player_user_id,player_slot,spotify_track_id,spotify_uri,song_name,artist_name) values(tst.r('T'),tst.rid(tst.r('T'),1),auth.uid(),2,'tt2','spotify:track:tt2','S','A')$$);
:u1
select 'T35 vote own team', tst.q($$mb_cast_category_votes(tst.rid(tst.r('T'),1),tst.mem(tst.r('T')),tst.votes(1))$$);
select 'T36 vote 3', tst.x($$select mb_cast_category_votes(tst.rid(tst.r('T'),1),tst.mem(tst.r('T')),tst.votes(3))$$);
select 'T37 voter corner', tst.q($$(select string_agg(distinct voter_slot::text, ',') from mb_category_votes where round_id=tst.rid(tst.r('T'),1))$$);

-- ===== Raum F: voll mit 6 =====
:u1
select 'F01 create', tst.x($$insert into tst.v select 'F', room_code from mb_create_group_room('Ana')$$);
:u2
select 'F02', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='F'),'B','player'))$$);
:u3
select 'F03', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='F'),'C','player'))$$);
:u4
select 'F04', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='F'),'D','player'))$$);
:u5
select 'F05', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='F'),'E','player'))$$);
:u6
select 'F06', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='F'),'F','player'))$$);
:u7
select 'F07 full', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='F'),'G','player'))$$);
select 'F08 juror', tst.q($$(select role from mb_join_room((select v from tst.v where k='F'),'G','juror'))$$);
:u8
select 'F09 local p2', tst.q($$(select player_slot from mb_add_local_player2((select id from mb_rooms where code=(select v from tst.v where k='F')),'X'))$$);
